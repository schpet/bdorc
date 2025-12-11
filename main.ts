/**
 * bdorc CLI - Beads orchestrator for Claude Code
 */

import { runOrchestrator } from "./src/mod.ts";

async function main() {
  const args = Deno.args;

  // Simple arg parsing
  let workingDirectory = Deno.cwd();
  let maxIterations = 100;
  let model: string | undefined;
  let maxTurns: number | undefined;
  let verbose = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dir":
      case "-d":
        workingDirectory = args[++i];
        break;
      case "--max-iterations":
      case "-n":
        maxIterations = parseInt(args[++i], 10);
        break;
      case "--model":
      case "-m":
        model = args[++i];
        break;
      case "--max-turns":
        maxTurns = parseInt(args[++i], 10);
        break;
      case "--quiet":
      case "-q":
        verbose = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        Deno.exit(0);
        break;
      default:
        if (args[i].startsWith("-")) {
          console.error(`Unknown option: ${args[i]}`);
          Deno.exit(1);
        }
        // Treat as working directory
        workingDirectory = args[i];
    }
  }

  console.log("bdorc - Beads orchestrator for Claude Code");
  console.log("==========================================");

  try {
    const result = await runOrchestrator({
      workingDirectory,
      maxIterations,
      model,
      maxTurns,
      verbose,
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
}

function printHelp() {
  console.log(`
bdorc - Beads orchestrator for Claude Code

Usage: deno run --allow-run --allow-read main.ts [options] [directory]

Options:
  -d, --dir <path>        Working directory (default: current directory)
  -n, --max-iterations    Maximum loop iterations (default: 100)
  -m, --model <model>     Claude model to use
  --max-turns <n>         Max turns for Claude Code
  -q, --quiet             Quiet mode (less output)
  -h, --help              Show this help

Examples:
  deno run --allow-run --allow-read main.ts
  deno run --allow-run --allow-read main.ts -d /path/to/project
  deno run --allow-run --allow-read main.ts -n 10 -m sonnet
`);
}

if (import.meta.main) {
  main();
}
