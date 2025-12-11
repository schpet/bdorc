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

const DEFAULT_DENO_CONFIG: Required<
  Pick<
    GatesConfig,
    "testCommand" | "typecheckCommand" | "formatCommand" | "lintCommand"
  >
> = {
  testCommand: ["deno", "test"],
  typecheckCommand: ["deno", "check", "**/*.ts"],
  // Exclude .beads directory from format check (auto-generated files)
  formatCommand: ["deno", "fmt", "--check", "--ignore=.beads"],
  lintCommand: ["deno", "lint"],
};

/**
 * Load gates config from .config/bdorc.toml, falling back to defaults
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
export async function runTests(config: GatesConfig): Promise<GateResult> {
  const command = config.testCommand || DEFAULT_DENO_CONFIG.testCommand;
  return await runGate("tests", command, config.workingDirectory);
}

/**
 * Run type checking
 */
export async function runTypecheck(config: GatesConfig): Promise<GateResult> {
  const command = config.typecheckCommand ||
    DEFAULT_DENO_CONFIG.typecheckCommand;
  return await runGate("typecheck", command, config.workingDirectory);
}

/**
 * Run format check
 */
export async function runFormat(config: GatesConfig): Promise<GateResult> {
  const command = config.formatCommand || DEFAULT_DENO_CONFIG.formatCommand;
  return await runGate("format", command, config.workingDirectory);
}

/**
 * Run linter
 */
export async function runLint(config: GatesConfig): Promise<GateResult> {
  const command = config.lintCommand || DEFAULT_DENO_CONFIG.lintCommand;
  return await runGate("lint", command, config.workingDirectory);
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
