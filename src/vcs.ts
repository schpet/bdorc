/**
 * Version control integration - auto-commit after gates pass
 */

import type { BeadsIssue } from "./beads.ts";
import { loadConfig } from "./config.ts";

export interface VcsConfig {
  enabled: boolean;
  command: "jj";
}

export interface VcsResult {
  success: boolean;
  message: string;
  error?: string;
}

const DEFAULT_VCS_CONFIG: VcsConfig = {
  enabled: false,
  command: "jj",
};

/**
 * Load VCS config from .config/bdorc.toml
 */
export async function loadVcsConfig(
  workingDirectory: string,
): Promise<VcsConfig> {
  const config = await loadConfig(workingDirectory);

  // If no [vcs] section exists, VCS is disabled
  if (!config?.vcs) {
    return DEFAULT_VCS_CONFIG;
  }

  const vcs = config.vcs as Record<string, unknown>;

  return {
    enabled: typeof vcs.enabled === "boolean" ? vcs.enabled : true,
    command: "jj",
  };
}

/**
 * Commit work for an issue using configured VCS
 */
export async function commitWork(
  issue: BeadsIssue,
  config: VcsConfig,
  workingDirectory: string,
): Promise<VcsResult> {
  if (!config.enabled) {
    return { success: true, message: "VCS disabled, skipping commit" };
  }

  const parts = [issue.title, ""];

  if (issue.description) {
    parts.push(issue.description, "");
  }

  if (issue.design) {
    parts.push("Design:", issue.design, "");
  }

  if (issue.acceptance_criteria) {
    parts.push("Acceptance:", issue.acceptance_criteria, "");
  }

  parts.push(`Beads: ${issue.id}`);

  const message = parts.join("\n");

  return await commitWithJj(message, workingDirectory);
}

/**
 * Check if the working copy has uncommitted changes
 */
export async function hasWorkingCopyChanges(
  workingDirectory: string,
): Promise<boolean> {
  const command = new Deno.Command("jj", {
    args: ["diff", "--git"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout } = await command.output();

  if (code !== 0) {
    // If jj diff fails, assume there might be changes to be safe
    return true;
  }

  const output = new TextDecoder().decode(stdout);
  return output.trim().length > 0;
}

/**
 * Ensure the working copy is clean before starting work on an issue.
 * If there are uncommitted changes, run `jj new` to create a fresh change,
 * effectively isolating the existing work as its own change.
 */
export async function ensureCleanWorkingCopy(
  config: VcsConfig,
  workingDirectory: string,
): Promise<VcsResult> {
  if (!config.enabled) {
    return { success: true, message: "VCS disabled, skipping pre-work check" };
  }

  const hasChanges = await hasWorkingCopyChanges(workingDirectory);

  if (!hasChanges) {
    return { success: true, message: "Working copy is clean" };
  }

  const process = new Deno.Command("jj", {
    args: ["new"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await process.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  if (code === 0) {
    return {
      success: true,
      message: "Created new change to isolate pre-existing work",
    };
  }

  return {
    success: false,
    message: "Failed to create new change",
    error: error || output,
  };
}

/**
 * Commit using jj
 */
async function commitWithJj(
  message: string,
  workingDirectory: string,
): Promise<VcsResult> {
  // Check for changes before attempting to commit
  const hasChanges = await hasWorkingCopyChanges(workingDirectory);
  if (!hasChanges) {
    return { success: true, message: "No changes to commit" };
  }

  const process = new Deno.Command("jj", {
    args: ["commit", "-m", message],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await process.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  if (code === 0) {
    return { success: true, message: output || "Committed successfully" };
  }

  return {
    success: false,
    message: "Commit failed",
    error: error || output,
  };
}
