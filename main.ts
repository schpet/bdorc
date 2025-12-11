/**
 * bdorc CLI - Beads orchestrator for Claude Code
 */

import { Command } from "@cliffy/command";
import { runOrchestrator } from "./src/mod.ts";

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
  .action(async (options) => {
    console.log("bdorc - Beads orchestrator for Claude Code");
    console.log("==========================================");

    try {
      const result = await runOrchestrator({
        workingDirectory: options.dir,
        maxIterations: options.maxIterations,
        model: options.model,
        maxTurns: options.maxTurns,
        verbose: !options.quiet,
        stream: options.stream ?? false,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions ?? false,
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
