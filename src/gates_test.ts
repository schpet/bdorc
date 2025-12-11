import { assertEquals } from "@std/assert";
import {
  formatGateResults,
  type GateResult,
  type GatesConfig,
  runAllGates,
  runFormat,
  runLint,
  runTests,
  runTypecheck,
} from "./gates.ts";

async function createTestDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "bdorc_gates_test_" });
}

async function setupTestProject(testDir: string) {
  // Create a simple valid TypeScript file
  await Deno.writeTextFile(
    `${testDir}/test_file.ts`,
    `export function hello(): string {
  return "hello";
}
`,
  );

  // Create a passing test (use import map reference to avoid lint warning)
  await Deno.writeTextFile(
    `${testDir}/test_file_test.ts`,
    `import { assertEquals } from "@std/assert";
import { hello } from "./test_file.ts";

Deno.test("hello returns hello", () => {
  assertEquals(hello(), "hello");
});
`,
  );

  // Create deno.json with proper formatting
  await Deno.writeTextFile(
    `${testDir}/deno.json`,
    `{
  "imports": {
    "@std/assert": "jsr:@std/assert@1"
  }
}
`,
  );
}

async function cleanup(testDir: string) {
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // ignore
  }
}

Deno.test({
  name: "gates: runTests passes for valid test file",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = { workingDirectory: testDir };

    const result = await runTests(config);
    assertEquals(result.name, "tests");
    assertEquals(result.passed, true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runTypecheck passes for valid TypeScript",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = {
      workingDirectory: testDir,
      typecheckCommand: ["deno", "check", "test_file.ts"],
    };

    const result = await runTypecheck(config);
    assertEquals(result.name, "typecheck");
    assertEquals(result.passed, true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runFormat passes for formatted code",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = { workingDirectory: testDir };

    const result = await runFormat(config);
    assertEquals(result.name, "format");
    assertEquals(result.passed, true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runLint passes for valid code",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = { workingDirectory: testDir };

    const result = await runLint(config);
    assertEquals(result.name, "lint");
    assertEquals(result.passed, true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runAllGates returns combined result",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = {
      workingDirectory: testDir,
      typecheckCommand: ["deno", "check", "test_file.ts"],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    assertEquals(results.length, 4);
    assertEquals(results.every((r) => r.passed), true);

    await cleanup(testDir);
  },
});

Deno.test("gates: formatGateResults formats output correctly", () => {
  const results: GateResult[] = [
    { name: "tests", passed: true, output: "", error: "" },
    { name: "typecheck", passed: false, output: "", error: "Type error found" },
    { name: "format", passed: true, output: "", error: "" },
  ];

  const output = formatGateResults(results);
  assertEquals(output.includes("PASS tests"), true);
  assertEquals(output.includes("FAIL typecheck"), true);
  assertEquals(output.includes("Type error found"), true);
});

Deno.test({
  name: "gates: custom commands are used when provided",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);
    const config: GatesConfig = {
      workingDirectory: testDir,
      testCommand: ["echo", "custom test"],
      typecheckCommand: ["echo", "custom typecheck"],
      formatCommand: ["echo", "custom format"],
      lintCommand: ["echo", "custom lint"],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    // All echo commands succeed
    assertEquals(results.every((r) => r.passed), true);

    await cleanup(testDir);
  },
});
