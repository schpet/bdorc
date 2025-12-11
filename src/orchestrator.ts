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
  buildIssuePrompt,
  type ClaudeConfig,
  runClaudeCode,
} from "./claude.ts";
import {
  formatGateResults,
  loadGatesConfig,
  runAllGates,
} from "./gates.ts";

export interface OrchestratorConfig {
  workingDirectory: string;
  maxIterations?: number;
  model?: string;
  maxTurns?: number;
  verbose?: boolean;
  stream?: boolean;
  dangerouslySkipPermissions?: boolean;
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

  // Load gates config from .config/bdorc.toml (or use defaults)
  const gatesConfig = await loadGatesConfig(config.workingDirectory);

  const completed: string[] = [];
  const failed: string[] = [];
  let gateFailures = 0;
  let iteration = 0;

  log(`Starting orchestrator in ${config.workingDirectory}`, verbose);

  // Log if custom config was loaded
  if (
    gatesConfig.testCommand || gatesConfig.typecheckCommand ||
    gatesConfig.formatCommand || gatesConfig.lintCommand
  ) {
    log(`Loaded custom gates config from .config/bdorc.toml`, verbose);
  }
  log(`Max iterations: ${maxIterations}`, verbose);

  while (iteration < maxIterations) {
    iteration++;
    log(`\n--- Iteration ${iteration} ---`, verbose);

    // Get ready work
    let readyWork: BeadsIssue[];
    try {
      readyWork = await getReadyWork(beadsConfig);
    } catch (error) {
      log(`Error getting ready work: ${error}`, verbose);
      break;
    }

    if (readyWork.length === 0) {
      log("No ready work found. Orchestrator complete.", verbose);
      break;
    }

    // Pick first issue (highest priority)
    const issue = readyWork[0];
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

    // Build prompt and run Claude Code
    const prompt = buildIssuePrompt(issue);
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

    // Run quality gates
    log(`Running quality gates...`, verbose);
    const gatesResult = await runAllGates(gatesConfig);
    log(formatGateResults(gatesResult.results), verbose);

    if (!gatesResult.passed) {
      gateFailures++;
      log(`Quality gates failed for ${issue.id}`, verbose);

      // Add notes about what failed
      const failedGates = gatesResult.results
        .filter((r) => !r.passed)
        .map((r) => r.name)
        .join(", ");
      await addNotes(
        issue.id,
        `Quality gates failed: ${failedGates}. Claude output: ${
          claudeResult.output.slice(0, 500)
        }`,
        beadsConfig,
      );

      // Keep issue in_progress for retry
      continue;
    }

    // Success - close the issue
    try {
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
