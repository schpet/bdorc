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
import { commitWork, ensureCleanWorkingCopy, loadVcsConfig } from "./vcs.ts";
import { systemLog, systemWarn } from "./system-log.ts";
import { createSleepInhibitor } from "./sleep-inhibitor.ts";
import { bold, cyan } from "@std/fmt/colors";

export interface OrchestratorConfig {
  workingDirectory: string;
  maxIterations?: number;
  model?: string;
  maxTurns?: number;
  verbose?: boolean;
  dangerouslySkipPermissions?: boolean;
  resumeIssues?: BeadsIssue[];
}

export interface OrchestratorResult {
  completed: string[];
  failed: string[];
  iterations: number;
  gateFailures: number;
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

  const sleepInhibitor = createSleepInhibitor();

  const completed: string[] = [];
  const failed: string[] = [];
  let gateFailures = 0;
  let iteration = 0;
  let idleMessagePrinted = false;

  if (verbose) {
    systemLog(`Starting orchestrator in ${config.workingDirectory}`);
  }

  // Warn if no gates configured
  if (!hasGatesConfigured(gatesConfig)) {
    systemWarn(
      "No quality gates configured. Create .config/bdorc.toml to add gates.",
    );
  } else if (verbose) {
    systemLog("Loaded gates config from .config/bdorc.toml");
  }

  if (hasReviewsConfigured(reviewsConfig) && verbose) {
    systemLog(
      `Loaded ${reviewsConfig.reviews.length} review(s) from .config/bdorc.toml`,
    );
  }
  if (verbose) {
    systemLog(`Max iterations: ${maxIterations}`);
  }

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
      if (verbose) {
        const cols = Deno.stdout.isTerminal() ? Deno.consoleSize().columns : 80;
        console.log(`\n${"─".repeat(cols)}`);
        systemLog(
          `${bold("Resuming:")} ${cyan(issue.id)} - ${bold(issue.title)}`,
        );
      }
    } else {
      // Get ready work
      let readyWork: BeadsIssue[];
      try {
        readyWork = await getReadyWork(beadsConfig);
      } catch (error) {
        if (verbose) {
          systemLog(`Error getting ready work: ${error}`);
        }
        break;
      }

      if (readyWork.length === 0) {
        sleepInhibitor.disable();

        // Print idle message once when we first become idle
        if (!idleMessagePrinted && verbose) {
          const pollSeconds = Math.round(pollIntervalMs / 1000);
          systemLog(`No ready issues, polling every ${pollSeconds}s...`);
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
      if (verbose) {
        const cols = Deno.stdout.isTerminal() ? Deno.consoleSize().columns : 80;
        console.log(`\n${"─".repeat(cols)}`);
        systemLog(
          `${bold("Working on:")} ${cyan(issue.id)} - ${bold(issue.title)}`,
        );
      }

      // Claim the issue
      try {
        await updateStatus(issue.id, "in_progress", beadsConfig);
        if (verbose) {
          systemLog(`Claimed issue ${issue.id}`);
        }
      } catch (error) {
        if (verbose) {
          systemLog(`Error claiming issue: ${error}`);
        }
        failed.push(issue.id);
        continue;
      }
    }

    sleepInhibitor.enable();

    // Ensure clean working copy before starting work
    const cleanResult = await ensureCleanWorkingCopy(
      vcsConfig,
      config.workingDirectory,
    );
    if (!cleanResult.success) {
      if (verbose) {
        systemLog(
          `Failed to ensure clean working copy: ${
            cleanResult.error || cleanResult.message
          }`,
        );
      }
      await addNotes(
        issue.id,
        `Failed to ensure clean working copy: ${
          cleanResult.error || cleanResult.message
        }`,
        beadsConfig,
      );
      failed.push(issue.id);
      continue;
    }
    if (
      cleanResult.message === "Created new change to isolate pre-existing work"
    ) {
      if (verbose) {
        systemLog("Created new jj change to isolate pre-existing work");
      }
    }

    // Build prompt and run Claude Code
    const prompt = isResume
      ? buildResumePrompt(issue)
      : buildIssuePrompt(issue);
    if (verbose) {
      systemLog("Running Claude Code...");
    }

    const claudeResult = await runClaudeCode(prompt, claudeConfig);

    if (!claudeResult.success) {
      if (verbose) {
        systemLog(`Claude Code failed: ${claudeResult.error}`);
      }
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

    if (verbose) {
      systemLog("Claude Code completed successfully");
    }

    // Run reviews (if configured)
    if (hasReviewsConfigured(reviewsConfig)) {
      if (verbose) {
        systemLog("Running reviews...");
      }
      const reviewsResult = await runAllReviews(reviewsConfig, claudeConfig);

      if (!reviewsResult.success) {
        if (verbose) {
          systemLog(`Reviews failed: ${reviewsResult.error}`);
        }
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

      if (reviewsResult.reviewsRun > 0 && verbose) {
        systemLog(
          `Completed ${reviewsResult.reviewsRun} review(s) successfully`,
        );
      }
    }

    // Run quality gates
    if (verbose) {
      systemLog("Running quality gates...");
    }
    const gatesResult = await runAllGates(gatesConfig);

    if (!gatesResult.passed) {
      gateFailures++;
      if (verbose) {
        systemLog(`Quality gates failed for ${issue.id}, running fix...`);
      }

      // Build fix prompt with failure details
      const failures: GateFailure[] = gatesResult.results
        .filter((r) => !r.passed)
        .map((r) => ({ name: r.name, output: r.output, error: r.error }));

      const fixPrompt = buildFixPrompt(issue.id, failures);
      if (verbose) {
        systemLog("Running Claude Code to fix failures...");
      }

      const fixResult = await runClaudeCode(fixPrompt, claudeConfig);

      if (!fixResult.success) {
        if (verbose) {
          systemLog(`Claude Code fix failed: ${fixResult.error}`);
        }
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

      if (verbose) {
        systemLog("Fix completed, re-running quality gates...");
      }

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
      if (verbose) {
        systemLog("Fix successful!");
      }
    }

    // Success - commit work and close the issue
    try {
      // Commit work using VCS
      if (vcsConfig.enabled) {
        if (verbose) {
          systemLog(`Committing work for ${issue.id}...`);
        }
        const commitResult = await commitWork(
          issue,
          vcsConfig,
          config.workingDirectory,
        );
        if (commitResult.success) {
          if (verbose) {
            systemLog(`Commit: ${commitResult.message}`);
          }
        } else {
          if (verbose) {
            systemLog(
              `Commit failed: ${commitResult.error || commitResult.message}`,
            );
          }
          // Continue to close the issue even if commit fails
        }
      }

      await closeIssue(
        issue.id,
        "Completed by orchestrator. All quality gates passed.",
        beadsConfig,
      );
      if (verbose) {
        systemLog(`Closed issue ${issue.id}`);
      }
      completed.push(issue.id);
    } catch (error) {
      if (verbose) {
        systemLog(`Error closing issue: ${error}`);
      }
      failed.push(issue.id);
    }
  }

  sleepInhibitor.disable();

  if (verbose) {
    systemLog("=== Orchestrator Summary ===");
    systemLog(`Iterations: ${iteration}`);
    systemLog(`Completed: ${completed.length}`);
    systemLog(`Failed: ${failed.length}`);
    systemLog(`Gate failures: ${gateFailures}`);
  }

  return {
    completed,
    failed,
    iterations: iteration,
    gateFailures,
  };
}
