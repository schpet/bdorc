/**
 * bdorc CLI - Beads orchestrator for Claude Code
 */

import { Command } from "@cliffy/command";
import { type BeadsIssue, getIssuesByStatus } from "./src/beads.ts";
import { buildFixPrompt, runClaudeCode } from "./src/claude.ts";
import {
  hasGatesConfigured,
  loadGatesConfig,
  runAllGates,
} from "./src/gates.ts";
import { runOrchestrator } from "./src/mod.ts";

/**
 * Check for in_progress issues from a previous run and prompt user to resume
 */
async function checkStaleIssues(
  workingDirectory: string,
): Promise<BeadsIssue[]> {
  try {
    const inProgress = await getIssuesByStatus("in_progress", {
      workingDirectory,
    });
    return inProgress;
  } catch {
    // bd might not be initialized, that's ok
    return [];
  }
}

const command = new Command()
  .name("bdorc")
  .version("0.1.0")
  .description("Beads orchestrator for Claude Code")
  .option("-d, --dir <path:string>", "Working directory", {
    default: Deno.cwd(),
  })
  .option("-n, --max-iterations <count:number>", "Maximum loop iterations", {
    default: 100,
  })
  .option("-m, --model <model:string>", "Claude model to use")
  .option("--max-turns <turns:number>", "Max turns for Claude Code")
  .option("-q, --quiet", "Quiet mode (less output)")
  .option("-s, --stream", "Stream Claude Code output in real-time")
  .option(
    "--dangerously-skip-permissions",
    "Skip permission prompts (CAUTION!)",
  )
  .option(
    "--poll-interval <ms:number>",
    "Polling interval when idle (ms)",
    { default: 1000 },
  )
  .option("-y, --yes", "Skip confirmation prompts")
  .action(async (options) => {
    if (!options.dangerouslySkipPermissions) {
      console.error(
        "Error: bdorc requires --dangerously-skip-permissions to run autonomously.",
      );
      console.error(
        "This tool runs Claude Code in a loop and cannot prompt for permissions.",
      );
      console.error("\nUsage: bdorc --dangerously-skip-permissions [options]");
      Deno.exit(1);
    }

    console.log("bdorc - Beads orchestrator for Claude Code");
    console.log("==========================================");

    // Run initial gate check
    const gatesConfig = await loadGatesConfig(options.dir);

    if (hasGatesConfigured(gatesConfig)) {
      console.log("\nRunning gates...");
      const gatesResult = await runAllGates(gatesConfig);

      if (!gatesResult.passed) {
        const failures = gatesResult.results
          .filter((r) => !r.passed)
          .map((r) => ({ name: r.name, output: r.output, error: r.error }));

        const fixPrompt = buildFixPrompt("initial-gates", failures);
        console.log("\n--- Prompt to Claude ---");
        console.log(fixPrompt);
        console.log("------------------------\n");
        console.log("Running Claude Code to fix gate failures...");
        const fixResult = await runClaudeCode(fixPrompt, {
          workingDirectory: options.dir,
          model: options.model,
          stream: options.stream ?? false,
          dangerouslySkipPermissions: options.dangerouslySkipPermissions ??
            false,
        });

        if (!fixResult.success) {
          console.error(`Claude Code failed: ${fixResult.error}`);
          Deno.exit(1);
        }

        // Re-run gates after fix
        console.log("\nRe-running gates...");
        const retryResult = await runAllGates(gatesConfig);

        if (!retryResult.passed) {
          console.error("Gates still failing after fix attempt.");
          Deno.exit(1);
        }

        console.log("Gates now passing!");
      }
    }

    // Check for stale in_progress issues
    const staleIssues = await checkStaleIssues(options.dir);

    if (staleIssues.length > 0) {
      console.warn("\n⚠️  Found in_progress issues from a previous run:");
      for (const issue of staleIssues) {
        console.warn(`   ${issue.id}: ${issue.title}`);
      }
      console.warn("   Resuming these issues automatically.\n");
      // Always resume - leave them as in_progress and the orchestrator
      // will pick them up with their existing notes/context
    }

    try {
      // In stream mode, run indefinitely unless user specified a limit
      const maxIterations = options.stream && options.maxIterations === 100
        ? Infinity
        : options.maxIterations;

      const result = await runOrchestrator({
        workingDirectory: options.dir,
        maxIterations,
        model: options.model,
        maxTurns: options.maxTurns,
        verbose: !options.quiet,
        stream: options.stream ?? false,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions ?? false,
        pollIntervalMs: options.pollInterval,
        resumeIssues: staleIssues.length > 0 ? staleIssues : undefined,
      });

      if (result.failed.length > 0) {
        console.error(`\nSome issues failed: ${result.failed.join(", ")}`);
        Deno.exit(1);
      }

      console.log("\nAll done!");
      Deno.exit(0);
    } catch (error) {
      console.error(`Error: ${error}`);
      Deno.exit(1);
    }
  });

if (import.meta.main) {
  await command.parse(Deno.args);
}
