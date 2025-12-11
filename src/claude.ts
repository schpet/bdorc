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
}

/**
 * Run Claude Code CLI with --print flag
 */
export async function runClaudeCode(
  prompt: string,
  config: ClaudeConfig
): Promise<ClaudeResult> {
  const args = ["--print"];

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.maxTurns) {
    args.push("--max-turns", config.maxTurns.toString());
  }

  args.push(prompt);

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
    "- Keep changes focused on this issue"
  );

  return parts.join("\n");
}
