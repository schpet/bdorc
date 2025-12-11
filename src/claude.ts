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
  stream?: boolean;
}

/**
 * Run Claude Code CLI with --print flag
 */
export async function runClaudeCode(
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

  if (config.stream) {
    return runClaudeCodeStreaming(args, config.workingDirectory);
  }

  const command = new Deno.Command("claude", {
    args,
    cwd: config.workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  return {
    success: code === 0,
    output,
    error,
    exitCode: code,
  };
}

/**
 * Run Claude Code with streaming output to console
 */
async function runClaudeCodeStreaming(
  args: string[],
  cwd: string,
): Promise<ClaudeResult> {
  const command = new Deno.Command("claude", {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  });

  const process = command.spawn();

  // Collect output while streaming
  let output = "";
  let error = "";

  // Stream stdout
  const stdoutReader = process.stdout.getReader();
  const stderrReader = process.stderr.getReader();
  const decoder = new TextDecoder();

  // Read both streams concurrently
  const readStdout = async () => {
    while (true) {
      const { done, value } = await stdoutReader.read();
      if (done) break;
      const text = decoder.decode(value);
      output += text;
      Deno.stdout.writeSync(new TextEncoder().encode(text));
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
    output,
    error,
    exitCode: code,
  };
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
