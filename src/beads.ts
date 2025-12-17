/**
 * Beads integration module - interact with bd CLI
 */

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  design: string | null;
  acceptance_criteria: string | null;
  notes: string | null;
  status: "open" | "in_progress" | "blocked" | "closed";
  priority: number;
  issue_type: "bug" | "feature" | "task" | "epic" | "chore";
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  assignee: string | null;
  labels: string[];
}

export interface BeadsConfig {
  workingDirectory: string;
}

/**
 * Run bd CLI command and return parsed JSON output
 * Uses --no-db mode to operate directly on JSONL without SQLite
 * This avoids WAL mode issues in container environments
 */
async function runBdCommand(
  args: string[],
  config: BeadsConfig,
): Promise<string> {
  const command = new Deno.Command("bd", {
    args: ["--no-db", ...args, "--json"],
    cwd: config.workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    throw new Error(`bd command failed: ${errorText}`);
  }

  return new TextDecoder().decode(stdout);
}

/**
 * Get list of ready (unblocked) issues
 */
export async function getReadyWork(
  config: BeadsConfig,
): Promise<BeadsIssue[]> {
  const output = await runBdCommand(["ready"], config);
  if (!output.trim()) {
    return [];
  }
  return JSON.parse(output);
}

/**
 * Get a single issue by ID
 */
export async function getIssue(
  id: string,
  config: BeadsConfig,
): Promise<BeadsIssue> {
  const output = await runBdCommand(["show", id], config);
  const result = JSON.parse(output);
  // bd show returns an array
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Update issue status
 */
export async function updateStatus(
  id: string,
  status: "open" | "in_progress" | "blocked" | "closed",
  config: BeadsConfig,
): Promise<BeadsIssue> {
  const output = await runBdCommand(
    ["update", id, "--status", status],
    config,
  );
  // bd update returns an array
  const result = JSON.parse(output);
  if (Array.isArray(result)) {
    return result[0];
  }
  return result.result || result;
}

/**
 * Close an issue with a reason
 */
export async function closeIssue(
  id: string,
  reason: string,
  config: BeadsConfig,
): Promise<void> {
  await runBdCommand(["close", id, "--reason", reason], config);
}

/**
 * Add notes to an issue
 */
export async function addNotes(
  id: string,
  notes: string,
  config: BeadsConfig,
): Promise<BeadsIssue> {
  const output = await runBdCommand(
    ["update", id, "--notes", notes],
    config,
  );
  await flushChanges(config);
  const result = JSON.parse(output);
  if (Array.isArray(result)) {
    return result[0];
  }
  return result.result || result;
}

/**
 * Get issues by status
 */
export async function getIssuesByStatus(
  status: "open" | "in_progress" | "blocked" | "closed",
  config: BeadsConfig,
): Promise<BeadsIssue[]> {
  const output = await runBdCommand(["list", "--status", status], config);
  if (!output.trim()) {
    return [];
  }
  return JSON.parse(output);
}
