/**
 * bdorc CLI - Beads orchestrator for Claude Code
 */

import { Command } from "@cliffy/command";
import { Confirm } from "@cliffy/prompt";
import { type BeadsIssue, getIssuesByStatus } from "./src/beads.ts";
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
    console.log("bdorc - Beads orchestrator for Claude Code");
    console.log("==========================================");

    // Check for stale in_progress issues
    const staleIssues = await checkStaleIssues(options.dir);

    if (staleIssues.length > 0 && !options.yes) {
      console.log("\nFound in_progress issues from a previous run:");
      for (const issue of staleIssues) {
        console.log(`  ${issue.id}: ${issue.title}`);
      }

      const resume = await Confirm.prompt({
        message: "Resume these issues?",
        default: true,
      });

      if (!resume) {
        console.log("Resetting issues to open status...");
        const { updateStatus } = await import("./src/beads.ts");
        for (const issue of staleIssues) {
          await updateStatus(issue.id, "open", {
            workingDirectory: options.dir,
          });
          console.log(`  Reset ${issue.id} to open`);
        }
      }
      // If resume=true, we leave them as in_progress and the orchestrator
      // will pick them up with their existing notes/context
    }

    try {
      const result = await runOrchestrator({
        workingDirectory: options.dir,
        maxIterations: options.maxIterations,
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
