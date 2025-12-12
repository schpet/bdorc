/**
 * Main orchestrator - runs Claude Code in a loop until all beads tasks are done
 */

import {
  addNotes,
  type BeadsConfig,
  type BeadsIssue,
  closeIssue,
  getReadyWork,
  updateStatus,
} from "./beads.ts";
import {
  buildFixPrompt,
  buildIssuePrompt,
  buildResumePrompt,
  type ClaudeConfig,
  type GateFailure,
  runClaudeCode,
} from "./claude.ts";
import { hasGatesConfigured, loadGatesConfig, runAllGates } from "./gates.ts";
import {
  hasReviewsConfigured,
  loadReviewsConfig,
  runAllReviews,
} from "./reviews.ts";
import { commitWork, loadVcsConfig } from "./vcs.ts";

export interface OrchestratorConfig {
  workingDirectory: string;
  maxIterations?: number;
  model?: string;
  maxTurns?: number;
  verbose?: boolean;
  stream?: boolean;
  dangerouslySkipPermissions?: boolean;
  resumeIssues?: BeadsIssue[];
}

export interface OrchestratorResult {
  completed: string[];
  failed: string[];
  iterations: number;
  gateFailures: number;
}

function log(message: string, verbose: boolean) {
  if (verbose) {
    console.log(message);
  }
}

/**
 * Run the orchestrator loop
 */
export async function runOrchestrator(
  config: OrchestratorConfig,
): Promise<OrchestratorResult> {
  const beadsConfig: BeadsConfig = {
    workingDirectory: config.workingDirectory,
  };

  const claudeConfig: ClaudeConfig = {
    workingDirectory: config.workingDirectory,
    model: config.model,
    maxTurns: config.maxTurns,
    stream: config.stream,
    dangerouslySkipPermissions: config.dangerouslySkipPermissions,
  };

  const maxIterations = config.maxIterations ?? 100;
  const verbose = config.verbose ?? true;
  const pollIntervalMs = 1000;

  // Load gates config from .config/bdorc.toml (or use defaults)
  const gatesConfig = await loadGatesConfig(config.workingDirectory);

  // Load reviews config
  const reviewsConfig = await loadReviewsConfig(config.workingDirectory);

  // Load VCS config
  const vcsConfig = await loadVcsConfig(config.workingDirectory);

  const completed: string[] = [];
  const failed: string[] = [];
  let gateFailures = 0;
  let iteration = 0;
  let idleMessagePrinted = false;

  log(`Starting orchestrator in ${config.workingDirectory}`, verbose);

  // Warn if no gates configured
  if (!hasGatesConfigured(gatesConfig)) {
    console.log(
      "%cWarning: No quality gates configured. Create .config/bdorc.toml to add gates.",
      "color: yellow",
    );
  } else {
    log(`Loaded gates config from .config/bdorc.toml`, verbose);
  }

  if (hasReviewsConfigured(reviewsConfig)) {
    log(
      `Loaded ${reviewsConfig.reviews.length} review(s) from .config/bdorc.toml`,
      verbose,
    );
  }
  log(`Max iterations: ${maxIterations}`, verbose);

  // Track issues to resume (consumed as we process them)
  const resumeQueue = config.resumeIssues ? [...config.resumeIssues] : [];

  while (iteration < maxIterations) {
    let issue: BeadsIssue;
    let isResume = false;

    // First, process any resume issues
    if (resumeQueue.length > 0) {
      issue = resumeQueue.shift()!;
      isResume = true;
      iteration++;
      log(`\n--- Iteration ${iteration} ---`, verbose);
      log(`Resuming: ${issue.id} - ${issue.title}`, verbose);
    } else {
      // Get ready work
      let readyWork: BeadsIssue[];
      try {
        readyWork = await getReadyWork(beadsConfig);
      } catch (error) {
        log(`Error getting ready work: ${error}`, verbose);
        break;
      }

      if (readyWork.length === 0) {
        // Print idle message once when we first become idle
        if (!idleMessagePrinted) {
          const pollSeconds = Math.round(pollIntervalMs / 1000);
          log(`No ready issues, polling every ${pollSeconds}s...`, verbose);
          idleMessagePrinted = true;
        }
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      // Reset idle message flag when we find work
      idleMessagePrinted = false;

      // Pick first issue (highest priority)
      issue = readyWork[0];
      iteration++;
      log(`\n--- Iteration ${iteration} ---`, verbose);
      log(`Working on: ${issue.id} - ${issue.title}`, verbose);

      // Claim the issue
      try {
        await updateStatus(issue.id, "in_progress", beadsConfig);
        log(`Claimed issue ${issue.id}`, verbose);
      } catch (error) {
        log(`Error claiming issue: ${error}`, verbose);
        failed.push(issue.id);
        continue;
      }
    }

    // Build prompt and run Claude Code
    const prompt = isResume
      ? buildResumePrompt(issue)
      : buildIssuePrompt(issue);
    log(`Running Claude Code...`, verbose);

    const claudeResult = await runClaudeCode(prompt, claudeConfig);

    if (!claudeResult.success) {
      log(`Claude Code failed: ${claudeResult.error}`, verbose);
      await addNotes(
        issue.id,
        `Claude Code failed (exit ${claudeResult.exitCode}): ${
          claudeResult.error.slice(0, 500)
        }`,
        beadsConfig,
      );
      failed.push(issue.id);
      continue;
    }

    log(`Claude Code completed successfully`, verbose);

    // Run reviews (if configured)
    if (hasReviewsConfigured(reviewsConfig)) {
      log(`Running reviews...`, verbose);
      const reviewsResult = await runAllReviews(reviewsConfig, claudeConfig);

      if (!reviewsResult.success) {
        log(`Reviews failed: ${reviewsResult.error}`, verbose);
        await addNotes(
          issue.id,
          `Reviews failed after ${reviewsResult.reviewsRun} review(s): ${
            reviewsResult.error?.slice(0, 500)
          }`,
          beadsConfig,
        );
        // Keep in_progress for next iteration to retry
        continue;
      }

      if (reviewsResult.reviewsRun > 0) {
        log(
          `Completed ${reviewsResult.reviewsRun} review(s) successfully`,
          verbose,
        );
      }
    }

    // Run quality gates
    log(`Running quality gates...`, verbose);
    const gatesResult = await runAllGates(gatesConfig);

    if (!gatesResult.passed) {
      gateFailures++;
      log(`Quality gates failed for ${issue.id}, running fix...`, verbose);

      // Build fix prompt with failure details
      const failures: GateFailure[] = gatesResult.results
        .filter((r) => !r.passed)
        .map((r) => ({ name: r.name, output: r.output, error: r.error }));

      const fixPrompt = buildFixPrompt(issue.id, failures);
      log(`Running Claude Code to fix failures...`, verbose);

      const fixResult = await runClaudeCode(fixPrompt, claudeConfig);

      if (!fixResult.success) {
        log(`Claude Code fix failed: ${fixResult.error}`, verbose);
        await addNotes(
          issue.id,
          `Fix attempt failed (exit ${fixResult.exitCode}): ${
            fixResult.error.slice(0, 500)
          }`,
          beadsConfig,
        );
        // Keep in_progress for next iteration to retry
        continue;
      }

      log(`Fix completed, re-running quality gates...`, verbose);

      // Re-run gates after fix
      const retryResult = await runAllGates(gatesConfig);

      if (!retryResult.passed) {
        // Still failing - add notes and continue to next iteration
        const stillFailing = retryResult.results
          .filter((r) => !r.passed)
          .map((r) => r.name)
          .join(", ");
        await addNotes(
          issue.id,
          `Gates still failing after fix attempt: ${stillFailing}`,
          beadsConfig,
        );
        continue;
      }

      // Fix worked! Fall through to close the issue
      log(`Fix successful!`, verbose);
    }

    // Success - commit work and close the issue
    try {
      // Commit work using VCS
      if (vcsConfig.enabled) {
        log(`Committing work for ${issue.id}...`, verbose);
        const commitResult = await commitWork(
          issue,
          vcsConfig,
          config.workingDirectory,
        );
        if (commitResult.success) {
          log(`Commit: ${commitResult.message}`, verbose);
        } else {
          log(
            `Commit failed: ${commitResult.error || commitResult.message}`,
            verbose,
          );
          // Continue to close the issue even if commit fails
        }
      }

      await closeIssue(
        issue.id,
        "Completed by orchestrator. All quality gates passed.",
        beadsConfig,
      );
      log(`Closed issue ${issue.id}`, verbose);
      completed.push(issue.id);
    } catch (error) {
      log(`Error closing issue: ${error}`, verbose);
      failed.push(issue.id);
    }
  }

  log(`\n=== Orchestrator Summary ===`, verbose);
  log(`Iterations: ${iteration}`, verbose);
  log(`Completed: ${completed.length}`, verbose);
  log(`Failed: ${failed.length}`, verbose);
  log(`Gate failures: ${gateFailures}`, verbose);

  return {
    completed,
    failed,
    iterations: iteration,
    gateFailures,
  };
}
