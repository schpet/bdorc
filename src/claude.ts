/**
 * Claude Code runner module - execute claude CLI with --print flag
 */

export interface ClaudeResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
}

export interface ClaudeConfig {
  workingDirectory: string;
  model?: string;
  maxTurns?: number;
  dangerouslySkipPermissions?: boolean;
}

/**
 * Run Claude Code CLI with --print flag (always streams output)
 */
export function runClaudeCode(
  prompt: string,
  config: ClaudeConfig,
): Promise<ClaudeResult> {
  const args = ["--print"];

  // Allow skipping permissions for automated execution
  if (config.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.maxTurns) {
    args.push("--max-turns", config.maxTurns.toString());
  }

  args.push(prompt);

  return runClaudeCodeStreaming(args, config.workingDirectory);
}

/**
 * Run Claude Code with streaming output to console
 * Uses --output-format stream-json --verbose to get real-time output
 */
async function runClaudeCodeStreaming(
  args: string[],
  cwd: string,
): Promise<ClaudeResult> {
  // Add streaming flags for real-time output
  const streamArgs = [...args, "--output-format", "stream-json", "--verbose"];

  const command = new Deno.Command("claude", {
    args: streamArgs,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Collect output while streaming
  let finalResult = "";
  let error = "";

  // Stream stdout
  const stdoutReader = process.stdout.getReader();
  const stderrReader = process.stderr.getReader();
  const decoder = new TextDecoder();

  // Read both streams concurrently
  const readStdout = async () => {
    let buffer = "";
    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          displayStreamEvent(event);

          // Capture final result
          if (event.type === "result" && event.result) {
            finalResult = event.result;
          }
        } catch {
          // Not JSON, print raw
          console.log(line);
        }
      }
    }
  };

  const readStderr = async () => {
    while (true) {
      const { done, value } = await stderrReader.read();
      if (done) break;
      const text = decoder.decode(value);
      error += text;
      Deno.stderr.writeSync(new TextEncoder().encode(text));
    }
  };

  // Wait for all streams to complete
  await Promise.all([readStdout(), readStderr()]);

  const { code } = await process.status;

  return {
    success: code === 0,
    output: finalResult,
    error,
    exitCode: code,
  };
}

/**
 * Display a stream-json event in a human-readable format
 */
function displayStreamEvent(event: Record<string, unknown>): void {
  const type = event.type as string;
  const subtype = event.subtype as string | undefined;

  switch (type) {
    case "assistant": {
      const message = event.message as Record<string, unknown> | undefined;
      if (message?.content) {
        const content = message.content as Array<Record<string, unknown>>;
        for (const block of content) {
          if (block.type === "text" && block.text) {
            Deno.stdout.writeSync(
              new TextEncoder().encode(block.text as string),
            );
          } else if (block.type === "tool_use") {
            const name = block.name as string;
            console.log(`\n[Tool: ${name}]`);
          }
        }
      }
      break;
    }
    case "user": {
      const message = event.message as Record<string, unknown> | undefined;
      if (message?.content) {
        const content = message.content as Array<Record<string, unknown>>;
        for (const block of content) {
          if (block.type === "tool_result") {
            const toolName = block.tool_name as string | undefined;
            if (toolName) {
              console.log(`[Result: ${toolName}]`);
            }
          }
        }
      }
      break;
    }
    case "result":
      if (subtype === "success") {
        console.log("\n[Done]");
      } else if (subtype === "error") {
        console.log(`\n[Error: ${event.error}]`);
      }
      break;
    case "system":
      // Skip system events (hooks, init, etc.)
      break;
  }
}

/**
 * Build a prompt for Claude Code to work on an issue
 */
export function buildIssuePrompt(issue: {
  id: string;
  title: string;
  description: string;
  design?: string | null;
  acceptance_criteria?: string | null;
}): string {
  const parts = [
    `Work on issue ${issue.id}: ${issue.title}`,
    "",
    "Description:",
    issue.description || "(no description)",
  ];

  if (issue.design) {
    parts.push("", "Design notes:", issue.design);
  }

  if (issue.acceptance_criteria) {
    parts.push("", "Acceptance criteria:", issue.acceptance_criteria);
  }

  parts.push(
    "",
    "Instructions:",
    "- Implement what's described above",
    "- Follow existing code patterns",
    "- Ensure code compiles and tests pass",
    "- Keep changes focused on this issue",
  );

  return parts.join("\n");
}

export interface GateFailure {
  name: string;
  output: string;
  error: string;
}

/**
 * Build a prompt to resume work on an in_progress issue
 */
export function buildResumePrompt(issue: {
  id: string;
  title: string;
  description: string;
  design?: string | null;
  acceptance_criteria?: string | null;
  notes?: string | null;
}): string {
  const parts = [
    `Resume work on issue ${issue.id}: ${issue.title}`,
    "",
    "This issue was left in_progress from a previous session. Pick up where it left off.",
    "",
    "Description:",
    issue.description || "(no description)",
  ];

  if (issue.design) {
    parts.push("", "Design notes:", issue.design);
  }

  if (issue.acceptance_criteria) {
    parts.push("", "Acceptance criteria:", issue.acceptance_criteria);
  }

  if (issue.notes) {
    parts.push("", "Previous session notes:", issue.notes);
  }

  parts.push(
    "",
    "Instructions:",
    "- Continue the work from where it was left off",
    "- Check git status to see what changes were already made",
    "- Follow existing code patterns",
    "- Ensure code compiles and tests pass",
    "- Keep changes focused on this issue",
  );

  return parts.join("\n");
}

/**
 * Build a prompt for Claude Code to fix quality gate failures
 */
export function buildFixPrompt(
  issueId: string,
  failures: GateFailure[],
): string {
  const parts = [
    `Fix quality gate failures for issue ${issueId}`,
    "",
    "The following quality gates failed:",
  ];

  for (const failure of failures) {
    parts.push("", `## ${failure.name} failed:`);
    if (failure.error) {
      parts.push("```", failure.error.slice(0, 2000), "```");
    }
    if (failure.output) {
      parts.push("```", failure.output.slice(0, 2000), "```");
    }
  }

  parts.push(
    "",
    "Instructions:",
    "- IMPORTANT: If the error is from a formatter or linter, run the auto-fix command (e.g. `deno fmt`, `prettier --write`, `eslint --fix`) instead of manually editing files",
    "- Fix the issues shown above",
    "- Run the failing commands to verify fixes work",
    "- Keep changes minimal and focused on fixing the failures",
  );

  return parts.join("\n");
}
