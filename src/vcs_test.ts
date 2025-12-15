import { assertEquals } from "@std/assert";
import {
  commitWork,
  ensureCleanWorkingCopy,
  hasWorkingCopyChanges,
  loadVcsConfig,
} from "./vcs.ts";

Deno.test({
  name: "loadVcsConfig: returns disabled config when no vcs section",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });
    const config = await loadVcsConfig(testDir);
    assertEquals(config.enabled, false);
    assertEquals(config.command, "jj");
    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "loadVcsConfig: parses enabled vcs config",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/bdorc.toml`,
      `[vcs]
enabled = true
`,
    );

    const config = await loadVcsConfig(testDir);
    assertEquals(config.enabled, true);
    assertEquals(config.command, "jj");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name:
    "hasWorkingCopyChanges: returns false when no changes (mocked via empty jj repo)",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    // No changes should exist in a fresh repo
    const hasChanges = await hasWorkingCopyChanges(testDir);
    assertEquals(hasChanges, false);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "hasWorkingCopyChanges: returns true when file is modified",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    // Create a file to make changes
    await Deno.writeTextFile(`${testDir}/test.txt`, "hello");

    // Should detect the new file
    const hasChanges = await hasWorkingCopyChanges(testDir);
    assertEquals(hasChanges, true);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name:
    "commitWork: returns no changes message when VCS enabled but no changes",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    const result = await commitWork(
      {
        id: "TEST-001",
        title: "Test issue",
        description: "Test description",
        design: null,
        acceptance_criteria: null,
        notes: null,
        issue_type: "task",
        status: "in_progress",
        priority: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        assignee: null,
        labels: [],
      },
      { enabled: true, command: "jj" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "No changes to commit");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "commitWork: skips commit when VCS disabled",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    const result = await commitWork(
      {
        id: "TEST-001",
        title: "Test issue",
        description: "Test description",
        design: null,
        acceptance_criteria: null,
        notes: null,
        issue_type: "task",
        status: "in_progress",
        priority: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: null,
        assignee: null,
        labels: [],
      },
      { enabled: false, command: "jj" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "VCS disabled, skipping commit");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "ensureCleanWorkingCopy: skips when VCS disabled",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    const result = await ensureCleanWorkingCopy(
      { enabled: false, command: "jj" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "VCS disabled, skipping pre-work check");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "ensureCleanWorkingCopy: returns clean when no changes exist",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    const result = await ensureCleanWorkingCopy(
      { enabled: true, command: "jj" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "Working copy is clean");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "ensureCleanWorkingCopy: runs jj new when changes exist",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "bdorc_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    // Create a file to make changes
    await Deno.writeTextFile(`${testDir}/test.txt`, "hello");

    // Verify changes exist before
    const hasChangesBefore = await hasWorkingCopyChanges(testDir);
    assertEquals(hasChangesBefore, true);

    const result = await ensureCleanWorkingCopy(
      { enabled: true, command: "jj" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(
      result.message,
      "Created new change to isolate pre-existing work",
    );

    // After jj new, the working copy should be clean (changes are in parent)
    const hasChangesAfter = await hasWorkingCopyChanges(testDir);
    assertEquals(hasChangesAfter, false);

    await Deno.remove(testDir, { recursive: true });
  },
});
