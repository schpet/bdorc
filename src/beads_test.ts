import { assertEquals, assertRejects } from "@std/assert";
import {
  type BeadsConfig,
  closeIssue,
  getIssue,
  getReadyWork,
  updateStatus,
} from "./beads.ts";

// These tests require bd to be installed and a beads project initialized
// They are integration tests that interact with real bd CLI

async function createTestDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "bdorc_test_" });
}

async function initBeads(testDir: string) {
  const command = new Deno.Command("bd", {
    args: ["init", "--prefix", "test"],
    cwd: testDir,
  });
  await command.output();
}

async function cleanup(testDir: string) {
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch {
    // ignore
  }
}

Deno.test({
  name: "beads: getReadyWork returns empty array when no issues",
  async fn() {
    const testDir = await createTestDir();
    await initBeads(testDir);
    const config: BeadsConfig = { workingDirectory: testDir };

    const issues = await getReadyWork(config);
    assertEquals(issues, []);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "beads: create and get issue",
  async fn() {
    const testDir = await createTestDir();
    await initBeads(testDir);
    const config: BeadsConfig = { workingDirectory: testDir };

    // Create an issue via bd CLI
    const createCmd = new Deno.Command("bd", {
      args: ["create", "Test issue", "-t", "task", "-p", "1", "--json"],
      cwd: testDir,
      stdout: "piped",
    });
    const { stdout } = await createCmd.output();
    const created = JSON.parse(new TextDecoder().decode(stdout));

    // Get ready work should include our issue
    const issues = await getReadyWork(config);
    assertEquals(issues.length, 1);
    assertEquals(issues[0].title, "Test issue");

    // Get specific issue
    const issue = await getIssue(created.id, config);
    assertEquals(issue.title, "Test issue");
    assertEquals(issue.priority, 1);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "beads: updateStatus changes issue status",
  async fn() {
    const testDir = await createTestDir();
    await initBeads(testDir);
    const config: BeadsConfig = { workingDirectory: testDir };

    // Create an issue
    const createCmd = new Deno.Command("bd", {
      args: ["create", "Status test", "--json"],
      cwd: testDir,
      stdout: "piped",
    });
    const { stdout } = await createCmd.output();
    const created = JSON.parse(new TextDecoder().decode(stdout));

    // Update status
    const updated = await updateStatus(created.id, "in_progress", config);
    assertEquals(updated.status, "in_progress");

    await cleanup(testDir);
  },
});

Deno.test({
  name: "beads: closeIssue closes the issue",
  async fn() {
    const testDir = await createTestDir();
    await initBeads(testDir);
    const config: BeadsConfig = { workingDirectory: testDir };

    // Create an issue
    const createCmd = new Deno.Command("bd", {
      args: ["create", "Close test", "--json"],
      cwd: testDir,
      stdout: "piped",
    });
    const { stdout } = await createCmd.output();
    const created = JSON.parse(new TextDecoder().decode(stdout));

    // Close it
    await closeIssue(created.id, "Test completed", config);

    // Should not be in ready work anymore
    const issues = await getReadyWork(config);
    assertEquals(issues.length, 0);

    await cleanup(testDir);
  },
});

Deno.test({
  name: "beads: getIssue throws for non-existent issue",
  async fn() {
    const testDir = await createTestDir();
    await initBeads(testDir);
    const config: BeadsConfig = { workingDirectory: testDir };

    await assertRejects(
      () => getIssue("nonexistent-123", config),
      Error,
    );

    await cleanup(testDir);
  },
});
