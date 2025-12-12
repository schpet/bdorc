import { assertEquals } from "@std/assert";
import { loadConfig, parseCommand } from "./config.ts";

Deno.test("parseCommand: simple command", () => {
  assertEquals(parseCommand("npm test"), ["npm", "test"]);
});

Deno.test("parseCommand: command with flags", () => {
  assertEquals(
    parseCommand("deno fmt --check --ignore=.beads"),
    ["deno", "fmt", "--check", "--ignore=.beads"],
  );
});

Deno.test("parseCommand: command with quoted string", () => {
  assertEquals(
    parseCommand('grep "hello world" file.txt'),
    ["grep", "hello world", "file.txt"],
  );
});

Deno.test("parseCommand: command with single quotes", () => {
  assertEquals(
    parseCommand("echo 'hello world'"),
    ["echo", "hello world"],
  );
});

Deno.test("parseCommand: npx command", () => {
  assertEquals(
    parseCommand("npx prettier --check ."),
    ["npx", "prettier", "--check", "."],
  );
});

Deno.test({
  name: "loadConfig: returns undefined for missing file",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_config_test_" });
    const config = await loadConfig(testDir);
    assertEquals(config, undefined);
    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "loadConfig: parses TOML config file with gates array",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_config_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/bdorc.toml`,
      `gates = [
  "npm test",
  "npx tsc --noEmit",
  "npx prettier --check .",
]
`,
    );

    const config = await loadConfig(testDir);
    assertEquals(Array.isArray(config?.gates), true);
    assertEquals(config?.gates?.length, 3);
    assertEquals(config?.gates?.[0], "npm test");
    assertEquals(config?.gates?.[1], "npx tsc --noEmit");
    assertEquals(config?.gates?.[2], "npx prettier --check .");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "loadConfig: handles single gate",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_config_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/bdorc.toml`,
      `gates = ["cargo build"]
`,
    );

    const config = await loadConfig(testDir);
    assertEquals(config?.gates?.length, 1);
    assertEquals(config?.gates?.[0], "cargo build");

    await Deno.remove(testDir, { recursive: true });
  },
});
