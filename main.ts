/**
 * ebo CLI - Beads orchestrator for Claude Code
 */

import { Command } from "@cliffy/command";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { type BeadsIssue, getIssuesByStatus } from "./src/beads.ts";
import {
  buildFixPrompt,
  checkClaudeAuth,
  runClaudeCode,
} from "./src/claude.ts";
import { loadConfig } from "./src/config.ts";
import {
  hasGatesConfigured,
  loadGatesConfig,
  runAllGates,
} from "./src/gates.ts";
import { runOrchestrator } from "./src/mod.ts";
import { installSignalHandlers } from "./src/process-manager.ts";
import { printBanner, systemLog, systemWarn } from "./src/system-log.ts";

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

const PROJECT_TYPE_GATES: Record<string, string[]> = {
  deno: ["deno fmt --check", "deno lint", "deno test -A"],
  rust: ["cargo fmt --check", "cargo clippy -- -D warnings", "cargo test"],
  node: ["npm test", "npx tsc --noEmit", "npx prettier --check ."],
  other: [],
};

const EXAMPLE_CONFIG_COMMENT = `# All available ebo configuration options:
#
# gates = [
#   "deno fmt --check",
#   "deno lint",
#   "deno test -A",
# ]
#
# [vcs]
# enabled = true
# command = "jj"
#
# [[reviews]]
# prompt = "Check for security vulnerabilities"

`;

function generateTomlConfig(options: {
  gates: string[];
  useVcs: boolean;
  reviews: string[];
}): string {
  let toml = EXAMPLE_CONFIG_COMMENT;
  toml += `gates = [\n`;
  for (const gate of options.gates) {
    toml += `  "${gate}",\n`;
  }
  toml += `]\n`;

  if (options.useVcs) {
    toml += `\n[vcs]\ncommand = "jj"\n`;
  }

  for (const review of options.reviews) {
    toml += `\n[[reviews]]\nprompt = "${review.replace(/"/g, '\\"')}"\n`;
  }

  return toml;
}

const initCommand = new Command()
  .name("init")
  .description("Initialize ebo configuration")
  .action(async () => {
    const initBeads = await Confirm.prompt({
      message: "Initialize beads in this repo?",
      default: true,
    });

    if (initBeads) {
      const prefix = await Input.prompt({
        message: "Issue prefix (leave empty for default):",
      });

      const bdArgs = ["init", "--stealth"];
      if (prefix.trim()) {
        bdArgs.push("--prefix", prefix.trim());
        console.log(`Initializing beads with prefix ${prefix.trim()}...`);
      } else {
        console.log("Initializing beads...");
      }

      const bdInit = new Deno.Command("bd", {
        args: bdArgs,
        stdout: "inherit",
        stderr: "inherit",
      });
      await bdInit.output();

      console.log("Running beads onboarding...");

      const claude = new Deno.Command("claude", {
        args: [
          "--dangerously-skip-permissions",
          "--print",
          "run 'bd onboard' and follow the instructions, but update CLAUDE.local.md and AGENTS.local.md instead of CLAUDE.md and AGENTS.md",
        ],
        stdout: "inherit",
        stderr: "inherit",
      });
      await claude.output();
    }

    const configPath = `${Deno.cwd()}/.config/ebo.toml`;

    const existingConfig = await loadConfig(Deno.cwd());
    if (existingConfig) {
      const overwrite = await Confirm.prompt({
        message: "Config file already exists. Overwrite?",
        default: false,
      });
      if (!overwrite) {
        console.log("Aborted.");
        return;
      }
    }

    const projectType = await Select.prompt({
      message: "What type of project is this?",
      options: [
        { name: "Deno", value: "deno" },
        { name: "Rust", value: "rust" },
        { name: "Node.js/TypeScript", value: "node" },
        { name: "Other", value: "other" },
      ],
    });

    const suggestedGates = PROJECT_TYPE_GATES[projectType] || [];
    let gates = [...suggestedGates];

    if (gates.length > 0) {
      console.log(`\nSuggested gates for ${projectType}:`);
      for (const gate of gates) {
        console.log(`  - ${gate}`);
      }
      const useDefaults = await Confirm.prompt({
        message: "Use these gates?",
        default: true,
      });
      if (!useDefaults) {
        gates = [];
      }
    }

    let addMore = gates.length === 0 ||
      await Confirm.prompt({
        message: "Add additional gates?",
        default: false,
      });
    while (addMore) {
      const gate = await Input.prompt({
        message: "Enter gate command (empty to finish):",
      });
      if (!gate.trim()) break;
      gates.push(gate.trim());
      addMore = await Confirm.prompt({
        message: "Add another gate?",
        default: false,
      });
    }

    const useVcs = await Confirm.prompt({
      message: "Enable automatic commits with jj?",
      default: false,
    });

    const reviews: string[] = [];
    let addReviews = await Confirm.prompt({
      message: "Add review prompts?",
      default: false,
    });
    while (addReviews) {
      const review = await Input.prompt({
        message: "Enter review prompt (empty to finish):",
      });
      if (!review.trim()) break;
      reviews.push(review.trim());
      addReviews = await Confirm.prompt({
        message: "Add another review prompt?",
        default: false,
      });
    }

    const tomlContent = generateTomlConfig({ gates, useVcs, reviews });

    try {
      await Deno.mkdir(`${Deno.cwd()}/.config`, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) {
        throw error;
      }
    }

    await Deno.writeTextFile(configPath, tomlContent);
    console.log(`\nConfiguration written to ${configPath}`);
  });

const creatorPromptCommand = new Command()
  .name("creator-prompt")
  .description("Print the beads issue creator system prompt")
  .action(() => {
    console.log(
      `you are the beads issue creator. your job is to research a problem, come up with issues, verify they will address the problem, and file them with beads. do not make the change, just create the issue. assume issues are being worked on as soon as you create them: follow ups should be new issues, not updates.`,
    );
  });

const helpCommand = new Command()
  .name("help")
  .description("Display documentation by keyword")
  .option("-k, --keyword <keyword:string>", "Keyword to search for in docs", {
    required: true,
  })
  .action(async (options) => {
    const docsDir = new URL("./docs", import.meta.url).pathname;

    try {
      const matches: string[] = [];
      for await (const entry of Deno.readDir(docsDir)) {
        if (
          entry.isFile && entry.name.endsWith(".md") &&
          entry.name.toLowerCase().includes(options.keyword.toLowerCase())
        ) {
          matches.push(entry.name);
        }
      }

      if (matches.length === 0) {
        console.error(`No documentation found matching keyword: ${options.keyword}`);
        console.error("\nAvailable docs:");
        for await (const entry of Deno.readDir(docsDir)) {
          if (entry.isFile && entry.name.endsWith(".md")) {
            console.error(`  - ${entry.name.replace(".md", "").replace(/-/g, " ")}`);
          }
        }
        Deno.exit(1);
      }

      for (const match of matches) {
        const content = await Deno.readTextFile(`${docsDir}/${match}`);
        console.log(content);
      }
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.error("Documentation directory not found.");
        Deno.exit(1);
      }
      throw error;
    }
  });

const command = new Command()
  .name("ebo")
  .version("0.1.0")
  .description("Beads orchestrator for Claude Code")
  .option("-n, --max-iterations <count:number>", "Maximum loop iterations", {
    default: 100,
  })
  .option("-m, --model <model:string>", "Claude model to use")
  .option("--max-turns <turns:number>", "Max turns for Claude Code")
  .option("-q, --quiet", "Quiet mode (less output)")
  .option(
    "--dangerously-skip-permissions",
    "Skip permission prompts (CAUTION!)",
  )
  .action(async (options) => {
    if (!options.dangerouslySkipPermissions) {
      console.error(
        "Error: ebo requires --dangerously-skip-permissions to run autonomously.",
      );
      console.error(
        "This tool runs Claude Code in a loop and cannot prompt for permissions.",
      );
      console.error("\nUsage: ebo --dangerously-skip-permissions [options]");
      Deno.exit(1);
    }

    if (!options.quiet) {
      printBanner();
    } else {
      systemLog("ebo - Beads orchestrator for Claude Code");
    }

    // Verify Claude is authenticated before proceeding
    systemLog("Checking Claude authentication...");
    const claudeOk = await checkClaudeAuth();
    if (!claudeOk) {
      console.error("Exiting due to Claude authentication failure.");
      Deno.exit(1);
    }

    // Run initial gate check
    const gatesConfig = await loadGatesConfig(Deno.cwd());

    if (hasGatesConfigured(gatesConfig)) {
      systemLog("Running gates...");
      const gatesResult = await runAllGates(gatesConfig);

      if (!gatesResult.passed) {
        const failures = gatesResult.results
          .filter((r) => !r.passed)
          .map((r) => ({ name: r.name, output: r.output, error: r.error }));

        const fixPrompt = buildFixPrompt("initial-gates", failures);
        systemLog("Running Claude Code to fix gate failures...");
        const fixResult = await runClaudeCode(fixPrompt, {
          workingDirectory: Deno.cwd(),
          model: options.model,
          dangerouslySkipPermissions: options.dangerouslySkipPermissions ??
            false,
        });

        if (!fixResult.success) {
          console.error(`Claude Code failed: ${fixResult.error}`);
          Deno.exit(1);
        }

        // Re-run gates after fix
        systemLog("Re-running gates...");
        const retryResult = await runAllGates(gatesConfig);

        if (!retryResult.passed) {
          console.error("Gates still failing after fix attempt.");
          Deno.exit(1);
        }

        systemLog("Gates now passing!");
      }
    }

    // Check for stale in_progress issues
    const staleIssues = await checkStaleIssues(Deno.cwd());

    if (staleIssues.length > 0) {
      systemWarn("Found in_progress issues from a previous run:");
      for (const issue of staleIssues) {
        systemWarn(`  ${issue.id}: ${issue.title}`);
      }
      systemWarn("Resuming these issues automatically.");
      // Always resume - leave them as in_progress and the orchestrator
      // will pick them up with their existing notes/context
    }

    try {
      // Run indefinitely unless user specified a limit
      const maxIterations = options.maxIterations === 100
        ? Infinity
        : options.maxIterations;

      const result = await runOrchestrator({
        workingDirectory: Deno.cwd(),
        maxIterations,
        model: options.model,
        maxTurns: options.maxTurns,
        verbose: !options.quiet,
        dangerouslySkipPermissions: options.dangerouslySkipPermissions ?? false,
        resumeIssues: staleIssues.length > 0 ? staleIssues : undefined,
      });

      if (result.failed.length > 0) {
        console.error(`\nSome issues failed: ${result.failed.join(", ")}`);
        Deno.exit(1);
      }

      systemLog("All done!");
      Deno.exit(0);
    } catch (error) {
      console.error(`Error: ${error}`);
      Deno.exit(1);
    }
  })
  .command("init", initCommand)
  .command("creator-prompt", creatorPromptCommand)
  .command("help", helpCommand);

if (import.meta.main) {
  installSignalHandlers();
  await command.parse(Deno.args);
}
