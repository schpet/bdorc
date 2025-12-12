/**
 * Reviews module - run configurable review prompts after issue completion
 */

import { type ClaudeConfig, runClaudeCode } from "./claude.ts";
import { loadConfig, type ReviewConfigRaw } from "./config.ts";

export interface Review {
  prompt: string;
}

export interface ReviewsConfig {
  workingDirectory: string;
  reviews: Review[];
}

/**
 * Load reviews config from .config/bdorc.toml
 */
export async function loadReviewsConfig(
  workingDirectory: string,
): Promise<ReviewsConfig> {
  const config = await loadConfig(workingDirectory);

  if (!config?.reviews || !Array.isArray(config.reviews)) {
    return { workingDirectory, reviews: [] };
  }

  const reviews: Review[] = config.reviews
    .filter(
      (r): r is ReviewConfigRaw =>
        typeof r === "object" && r !== null && typeof r.prompt === "string" &&
        r.prompt.length > 0,
    )
    .map((r) => ({ prompt: r.prompt }));

  return { workingDirectory, reviews };
}

/**
 * Check if any reviews are configured
 */
export function hasReviewsConfigured(config: ReviewsConfig): boolean {
  return config.reviews.length > 0;
}

/**
 * Get the current diff using jj diff --git
 */
async function getDiff(workingDirectory: string): Promise<string> {
  const command = new Deno.Command("jj", {
    args: ["diff", "--git"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new Error(`Failed to get diff: ${error}`);
  }

  return new TextDecoder().decode(stdout);
}

/**
 * Build a review prompt with the diff
 */
function buildReviewPrompt(reviewPrompt: string, diff: string): string {
  const parts = [
    "Review the following changes:",
    "",
    reviewPrompt,
    "",
    "Diff:",
    "```diff",
    diff,
    "```",
    "",
    "If you find issues, fix them. If the changes look good, do nothing.",
  ];

  return parts.join("\n");
}

/**
 * Run a single review
 */
export async function runReview(
  review: Review,
  diff: string,
  claudeConfig: ClaudeConfig,
): Promise<{ success: boolean; error?: string }> {
  const prompt = buildReviewPrompt(review.prompt, diff);
  const result = await runClaudeCode(prompt, claudeConfig);

  return {
    success: result.success,
    error: result.success ? undefined : result.error,
  };
}

/**
 * Run all configured reviews sequentially
 */
export async function runAllReviews(
  config: ReviewsConfig,
  claudeConfig: ClaudeConfig,
  options?: { showSpinner?: boolean },
): Promise<{ success: boolean; reviewsRun: number; error?: string }> {
  if (config.reviews.length === 0) {
    return { success: true, reviewsRun: 0 };
  }

  const showSpinner = options?.showSpinner ?? Deno.stdout.isTerminal();

  // Get the diff once for all reviews
  let diff: string;
  try {
    diff = await getDiff(config.workingDirectory);
  } catch (error) {
    return {
      success: false,
      reviewsRun: 0,
      error: `Failed to get diff: ${error}`,
    };
  }

  // If no changes, skip reviews
  if (!diff.trim()) {
    return { success: true, reviewsRun: 0 };
  }

  let reviewsRun = 0;

  for (const review of config.reviews) {
    const truncatedPrompt = review.prompt.length > 50
      ? review.prompt.slice(0, 47) + "..."
      : review.prompt;

    let spinner: { start: () => void; stop: () => void } | null = null;
    if (showSpinner) {
      const { Spinner } = await import("@std/cli/unstable-spinner");
      spinner = new Spinner({ message: `Review: ${truncatedPrompt}` });
      spinner.start();
    }

    const result = await runReview(review, diff, claudeConfig);
    reviewsRun++;

    if (spinner) {
      spinner.stop();
      const status = result.success ? "✓" : "✗";
      console.log(`${status} Review: ${truncatedPrompt}`);
    }

    if (!result.success) {
      return {
        success: false,
        reviewsRun,
        error: result.error,
      };
    }

    // After each review, get a fresh diff for the next review
    // (the review might have made changes)
    try {
      diff = await getDiff(config.workingDirectory);
    } catch (error) {
      return {
        success: false,
        reviewsRun,
        error: `Failed to get diff after review: ${error}`,
      };
    }

    // If no more changes, we can skip remaining reviews
    if (!diff.trim()) {
      break;
    }
  }

  return { success: true, reviewsRun };
}
