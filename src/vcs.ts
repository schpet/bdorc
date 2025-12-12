/**
 * Version control integration - auto-commit after gates pass
 */

import type { BeadsIssue } from "./beads.ts";
import { loadConfig } from "./config.ts";

export interface VcsConfig {
  enabled: boolean;
  command: "jj";
  commitFormat: string;
}

export interface VcsResult {
  success: boolean;
  message: string;
  error?: string;
}

const DEFAULT_VCS_CONFIG: VcsConfig = {
  enabled: false,
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

  // If no [vcs] section exists, VCS is disabled
  if (!config?.vcs) {
    return DEFAULT_VCS_CONFIG;
  }

  const vcs = config.vcs as Record<string, unknown>;

  return {
    enabled: typeof vcs.enabled === "boolean" ? vcs.enabled : true,
    command: "jj",
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

  return await commitWithJj(message, workingDirectory);
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
