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
  name: "loadConfig: parses TOML config file",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_config_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/bdorc.toml`,
      `[gates]
test = "npm test"
typecheck = "npx tsc --noEmit"
format = "npx prettier --check ."
lint = "npx eslint ."
`,
    );

    const config = await loadConfig(testDir);
    assertEquals(config?.gates?.test, "npm test");
    assertEquals(config?.gates?.typecheck, "npx tsc --noEmit");
    assertEquals(config?.gates?.format, "npx prettier --check .");
    assertEquals(config?.gates?.lint, "npx eslint .");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "loadConfig: handles partial config",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_config_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/bdorc.toml`,
      `[gates]
test = "cargo test"
`,
    );

    const config = await loadConfig(testDir);
    assertEquals(config?.gates?.test, "cargo test");
    assertEquals(config?.gates?.typecheck, undefined);

    await Deno.remove(testDir, { recursive: true });
  },
});
