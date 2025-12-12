/**
 * Quality gates module - tests, typecheck, format, lint
 */

import { loadConfig, parseCommand } from "./config.ts";

export interface GateResult {
  name: string;
  passed: boolean;
  output: string;
  error: string;
}

export interface GatesConfig {
  workingDirectory: string;
  testCommand?: string[];
  typecheckCommand?: string[];
  formatCommand?: string[];
  lintCommand?: string[];
}

/**
 * Load gates config from .config/bdorc.toml
 */
export async function loadGatesConfig(
  workingDirectory: string,
): Promise<GatesConfig> {
  const config = await loadConfig(workingDirectory);

  if (!config?.gates) {
    return { workingDirectory };
  }

  const gatesConfig: GatesConfig = { workingDirectory };

  if (config.gates.test) {
    gatesConfig.testCommand = parseCommand(config.gates.test);
  }
  if (config.gates.typecheck) {
    gatesConfig.typecheckCommand = parseCommand(config.gates.typecheck);
  }
  if (config.gates.format) {
    gatesConfig.formatCommand = parseCommand(config.gates.format);
  }
  if (config.gates.lint) {
    gatesConfig.lintCommand = parseCommand(config.gates.lint);
  }

  return gatesConfig;
}

/**
 * Check if any gates are configured
 */
export function hasGatesConfigured(config: GatesConfig): boolean {
  return !!(
    config.testCommand ||
    config.typecheckCommand ||
    config.formatCommand ||
    config.lintCommand
  );
}

async function runGate(
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
 * Run tests
 */
export async function runTests(
  config: GatesConfig,
): Promise<GateResult | null> {
  if (!config.testCommand) return null;
  return await runGate("tests", config.testCommand, config.workingDirectory);
}

/**
 * Run type checking
 */
export async function runTypecheck(
  config: GatesConfig,
): Promise<GateResult | null> {
  if (!config.typecheckCommand) return null;
  return await runGate(
    "typecheck",
    config.typecheckCommand,
    config.workingDirectory,
  );
}

/**
 * Run format check
 */
export async function runFormat(
  config: GatesConfig,
): Promise<GateResult | null> {
  if (!config.formatCommand) return null;
  return await runGate("format", config.formatCommand, config.workingDirectory);
}

/**
 * Run linter
 */
export async function runLint(config: GatesConfig): Promise<GateResult | null> {
  if (!config.lintCommand) return null;
  return await runGate("lint", config.lintCommand, config.workingDirectory);
}

/**
 * Run all quality gates
 */
export async function runAllGates(
  config: GatesConfig,
): Promise<{ passed: boolean; results: GateResult[] }> {
  const allResults = await Promise.all([
    runTests(config),
    runTypecheck(config),
    runFormat(config),
    runLint(config),
  ]);

  // Filter out null results (unconfigured gates)
  const results = allResults.filter((r): r is GateResult => r !== null);

  // If no gates configured, consider it passed
  const passed = results.length === 0 || results.every((r) => r.passed);

  return { passed, results };
}

/**
 * Format gate results for display
 */
export function formatGateResults(results: GateResult[]): string {
  const lines = ["Quality Gates:"];
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    lines.push(`  ${status} ${result.name}`);
    if (!result.passed && result.error) {
      lines.push(`    ${result.error.split("\n")[0]}`);
    }
  }
  return lines.join("\n");
}
