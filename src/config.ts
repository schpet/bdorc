/**
 * Configuration file support - reads .config/ebo.toml
 */

import { parse as parseToml } from "@std/toml";

export interface VcsConfigRaw {
  enabled?: boolean;
  command?: string;
}

export interface ReviewConfigRaw {
  prompt: string;
}

export interface EboConfig {
  gates?: string[];
  vcs?: VcsConfigRaw;
  reviews?: ReviewConfigRaw[];
}

/**
 * Load config from .config/ebo.toml in the working directory
 * Returns undefined if no config file exists
 */
export async function loadConfig(
  workingDirectory: string,
): Promise<EboConfig | undefined> {
  const configPath = `${workingDirectory}/.config/ebo.toml`;

  try {
    const content = await Deno.readTextFile(configPath);
    return parseToml(content) as EboConfig;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Parse a command string into array for Deno.Command
 * Handles quoted strings with spaces
 */
export function parseCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const char of command) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = "";
    } else if (char === " " && !inQuote) {
      if (current) {
        parts.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}
