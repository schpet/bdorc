import { assertEquals } from "@std/assert";
import {
  runTests,
  runTypecheck,
  runFormat,
  runLint,
  runAllGates,
  formatGateResults,
  type GatesConfig,
  type GateResult,
} from "./gates.ts";

// Create a minimal Deno project for testing
const TEST_DIR = Deno.makeTempDirSync({ prefix: "bdorc_gates_test_" });

async function setupTestProject() {
  // Create a simple valid TypeScript file
  await Deno.writeTextFile(
    `${TEST_DIR}/test_file.ts`,
    `export function hello(): string {
  return "hello";
}
`
  );

  // Create a passing test
  await Deno.writeTextFile(
    `${TEST_DIR}/test_file_test.ts`,
    `import { assertEquals } from "jsr:@std/assert";
import { hello } from "./test_file.ts";

Deno.test("hello returns hello", () => {
  assertEquals(hello(), "hello");
});
`
  );

  // Create deno.json
  await Deno.writeTextFile(
    `${TEST_DIR}/deno.json`,
    JSON.stringify({
      imports: {
        "@std/assert": "jsr:@std/assert@1",
      },
    })
  );
}

async function cleanup() {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

Deno.test({
  name: "gates: runTests passes for valid test file",
  async fn() {
    await setupTestProject();
    const config: GatesConfig = { workingDirectory: TEST_DIR };

    const result = await runTests(config);
    assertEquals(result.name, "tests");
    assertEquals(result.passed, true);

    await cleanup();
  },
});

Deno.test({
  name: "gates: runTypecheck passes for valid TypeScript",
  async fn() {
    await setupTestProject();
    const config: GatesConfig = {
      workingDirectory: TEST_DIR,
      typecheckCommand: ["deno", "check", "test_file.ts"],
    };

    const result = await runTypecheck(config);
    assertEquals(result.name, "typecheck");
    assertEquals(result.passed, true);

    await cleanup();
  },
});

Deno.test({
  name: "gates: runFormat passes for formatted code",
  async fn() {
    await setupTestProject();
    const config: GatesConfig = { workingDirectory: TEST_DIR };

    const result = await runFormat(config);
    assertEquals(result.name, "format");
    assertEquals(result.passed, true);

    await cleanup();
  },
});

Deno.test({
  name: "gates: runLint passes for valid code",
  async fn() {
    await setupTestProject();
    const config: GatesConfig = { workingDirectory: TEST_DIR };

    const result = await runLint(config);
    assertEquals(result.name, "lint");
    assertEquals(result.passed, true);

    await cleanup();
  },
});

Deno.test({
  name: "gates: runAllGates returns combined result",
  async fn() {
    await setupTestProject();
    const config: GatesConfig = {
      workingDirectory: TEST_DIR,
      typecheckCommand: ["deno", "check", "test_file.ts"],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    assertEquals(results.length, 4);
    assertEquals(results.every((r) => r.passed), true);

    await cleanup();
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
    await setupTestProject();
    const config: GatesConfig = {
      workingDirectory: TEST_DIR,
      testCommand: ["echo", "custom test"],
      typecheckCommand: ["echo", "custom typecheck"],
      formatCommand: ["echo", "custom format"],
      lintCommand: ["echo", "custom lint"],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    // All echo commands succeed
    assertEquals(results.every((r) => r.passed), true);

    await cleanup();
  },
});
