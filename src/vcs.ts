/**
 * Version control integration - auto-commit after gates pass
 */

import type { BeadsIssue } from "./beads.ts";
import { loadConfig } from "./config.ts";

export interface VcsConfig {
  enabled: boolean;
  command: "jj" | "git";
  commitFormat: string;
}

export interface VcsResult {
  success: boolean;
  message: string;
  error?: string;
}

const DEFAULT_VCS_CONFIG: VcsConfig = {
  enabled: true,
  command: "jj",
  commitFormat: "{id}: {title}",
};

/**
 * Load VCS config from .config/bdorc.toml
 */
export async function loadVcsConfig(
  workingDirectory: string,
): Promise<VcsConfig> {
  const config = await loadConfig(workingDirectory);

  if (!config?.vcs) {
    return DEFAULT_VCS_CONFIG;
  }

  const vcs = config.vcs as Record<string, unknown>;

  return {
    enabled: typeof vcs.enabled === "boolean" ? vcs.enabled : true,
    command: vcs.command === "git" ? "git" : "jj",
    commitFormat: typeof vcs.commit_format === "string"
      ? vcs.commit_format
      : DEFAULT_VCS_CONFIG.commitFormat,
  };
}

/**
 * Format commit message using template string
 * Supports: {id}, {title}
 */
export function formatCommitMessage(
  issue: BeadsIssue,
  format: string,
): string {
  return format
    .replace("{id}", issue.id)
    .replace("{title}", issue.title);
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

  const message = formatCommitMessage(issue, config.commitFormat);

  if (config.command === "jj") {
    return await commitWithJj(message, workingDirectory);
  } else {
    return await commitWithGit(message, workingDirectory);
  }
}

/**
 * Commit using jj
 */
async function commitWithJj(
  message: string,
  workingDirectory: string,
): Promise<VcsResult> {
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

  // jj returns success even with "nothing to commit" scenarios
  // but let's handle any edge cases gracefully
  if (error.includes("Nothing changed") || output.includes("Nothing changed")) {
    return { success: true, message: "Nothing to commit" };
  }

  return {
    success: false,
    message: "Commit failed",
    error: error || output,
  };
}

/**
 * Commit using git
 */
async function commitWithGit(
  message: string,
  workingDirectory: string,
): Promise<VcsResult> {
  // First, stage all changes
  const addProcess = new Deno.Command("git", {
    args: ["add", "-A"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const addResult = await addProcess.output();
  if (addResult.code !== 0) {
    const error = new TextDecoder().decode(addResult.stderr);
    return {
      success: false,
      message: "Failed to stage changes",
      error,
    };
  }

  // Then commit
  const commitProcess = new Deno.Command("git", {
    args: ["commit", "-m", message],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await commitProcess.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  if (code === 0) {
    return { success: true, message: output || "Committed successfully" };
  }

  // Handle "nothing to commit" case
  if (
    output.includes("nothing to commit") ||
    error.includes("nothing to commit")
  ) {
    return { success: true, message: "Nothing to commit" };
  }

  return {
    success: false,
    message: "Commit failed",
    error: error || output,
  };
}
