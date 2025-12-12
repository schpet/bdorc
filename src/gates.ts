/**
 * Quality gates module - generic command runner
 */

import { loadConfig, parseCommand } from "./config.ts";

export interface GateResult {
  name: string;
  passed: boolean;
  output: string;
  error: string;
}

export interface Gate {
  command: string[];
}

export interface GatesConfig {
  workingDirectory: string;
  gates: Gate[];
}

/**
 * Load gates config from .config/bdorc.toml
 */
export async function loadGatesConfig(
  workingDirectory: string,
): Promise<GatesConfig> {
  const config = await loadConfig(workingDirectory);

  if (!config?.gates || !Array.isArray(config.gates)) {
    return { workingDirectory, gates: [] };
  }

  const gates: Gate[] = config.gates
    .filter((cmd): cmd is string => typeof cmd === "string" && cmd.length > 0)
    .map((cmd) => ({ command: parseCommand(cmd) }));

  return { workingDirectory, gates };
}

/**
 * Check if any gates are configured
 */
export function hasGatesConfigured(config: GatesConfig): boolean {
  return config.gates.length > 0;
}

/**
 * Run a single gate
 */
export async function runGate(
  name: string,
  command: string[],
  workingDirectory: string,
): Promise<GateResult> {
  const [cmd, ...args] = command;
  const process = new Deno.Command(cmd, {
    args,
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await process.output();

  return {
    name,
    passed: code === 0,
    output: new TextDecoder().decode(stdout),
    error: new TextDecoder().decode(stderr),
  };
}

/**
 * Derive a gate name from its command
 */
function getGateName(command: string[]): string {
  return command.join(" ");
}

/**
 * Run all quality gates (sequentially with spinner feedback)
 */
export async function runAllGates(
  config: GatesConfig,
  options?: { showSpinner?: boolean },
): Promise<{ passed: boolean; results: GateResult[] }> {
  if (config.gates.length === 0) {
    return { passed: true, results: [] };
  }

  const showSpinner = options?.showSpinner ?? Deno.stdout.isTerminal();
  const results: GateResult[] = [];

  for (const gate of config.gates) {
    const name = getGateName(gate.command);

    let spinner: { start: () => void; stop: () => void } | null = null;
    if (showSpinner) {
      const { Spinner } = await import("@std/cli/unstable-spinner");
      spinner = new Spinner({ message: name });
      spinner.start();
    }

    const result = await runGate(name, gate.command, config.workingDirectory);
    results.push(result);

    if (spinner) {
      spinner.stop();
      const status = result.passed ? "✓" : "✗";
      console.log(`${status} ${name}`);
    }
  }

  const passed = results.every((r) => r.passed);

  return { passed, results };
}
