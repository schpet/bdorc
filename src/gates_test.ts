import { assertEquals } from "@std/assert";
import {
  formatGateResults,
  type GateResult,
  type GatesConfig,
  runAllGates,
  runGate,
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
  name: "gates: runGate passes for valid test",
  async fn() {
    const testDir = await createTestDir();
    await setupTestProject(testDir);

    const result = await runGate("tests", ["deno", "test"], testDir);
    assertEquals(result.name, "tests");
    assertEquals(result.passed, true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runGate fails for invalid command",
  async fn() {
    const testDir = await createTestDir();

    const result = await runGate("check", ["deno", "check", "nonexistent.ts"], testDir);
    assertEquals(result.name, "check");
    assertEquals(result.passed, false);

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
      gates: [
        { command: ["deno", "test"] },
        { command: ["deno", "check", "test_file.ts"] },
        { command: ["deno", "fmt", "--check"] },
        { command: ["deno", "lint"] },
      ],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    assertEquals(results.length, 4);
    assertEquals(results.every((r) => r.passed), true);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "gates: runAllGates passes when no gates configured",
  async fn() {
    const testDir = await createTestDir();
    const config: GatesConfig = { workingDirectory: testDir, gates: [] };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    assertEquals(results.length, 0);

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
  name: "gates: custom gates work correctly",
  async fn() {
    const testDir = await createTestDir();
    const config: GatesConfig = {
      workingDirectory: testDir,
      gates: [
        { command: ["echo", "hello"] },
        { command: ["echo", "world"] },
      ],
    };

    const { passed, results } = await runAllGates(config);
    assertEquals(passed, true);
    assertEquals(results.length, 2);
    assertEquals(results[0].name, "echo hello");
    assertEquals(results[1].name, "echo world");

    await cleanup(testDir);
  },
});
