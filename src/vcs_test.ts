import { assertEquals } from "@std/assert";
import {
  commitWork,
  ensureCleanWorkingCopy,
  hasWorkingCopyChanges,
  loadVcsConfig,
} from "./vcs.ts";

async function countJjCommits(workingDirectory: string): Promise<number> {
  const cmd = new Deno.Command("jj", {
    args: ["log", "--no-graph", "-T", "commit_id ++ '\\n'"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "null",
  });
  const { stdout } = await cmd.output();
  const output = new TextDecoder().decode(stdout);
  return output.trim().split("\n").filter(Boolean).length;
}

async function countGitCommits(workingDirectory: string): Promise<number> {
  const cmd = new Deno.Command("git", {
    args: ["rev-list", "--count", "HEAD"],
    cwd: workingDirectory,
    stdout: "piped",
    stderr: "null",
  });
  const { code, stdout } = await cmd.output();
  if (code !== 0) {
    return 0; // No commits yet
  }
  const output = new TextDecoder().decode(stdout);
  return parseInt(output.trim(), 10) || 0;
}

async function initGitRepo(workingDirectory: string): Promise<void> {
  // Initialize git repo
  const init = new Deno.Command("git", {
    args: ["init"],
    cwd: workingDirectory,
    stdout: "null",
    stderr: "null",
  });
  await init.output();

  // Configure git user for commits
  const configName = new Deno.Command("git", {
    args: ["config", "user.name", "Test User"],
    cwd: workingDirectory,
    stdout: "null",
    stderr: "null",
  });
  await configName.output();

  const configEmail = new Deno.Command("git", {
    args: ["config", "user.email", "test@example.com"],
    cwd: workingDirectory,
    stdout: "null",
    stderr: "null",
  });
  await configEmail.output();
}

Deno.test({
  name: "loadVcsConfig: returns disabled config when no vcs section",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    const config = await loadVcsConfig(testDir);
    assertEquals(config.enabled, false);
    assertEquals(config.command, "jj");
    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "loadVcsConfig: parses enabled vcs config",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/ebo.toml`,
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
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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
    "commitWork: returns no changes message and creates no commit when VCS enabled but no changes",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

    // Initialize a jj repo
    const init = new Deno.Command("jj", {
      args: ["git", "init"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await init.output();

    const countBefore = await countJjCommits(testDir);

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

    const countAfter = await countJjCommits(testDir);

    assertEquals(result.success, true);
    assertEquals(result.message, "No changes to commit");
    assertEquals(countAfter, countBefore, "No new commit should be created");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "commitWork: skips commit when VCS disabled",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });

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

// ============ Git tests ============

Deno.test({
  name: "loadVcsConfig: parses git command from config",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await Deno.mkdir(`${testDir}/.config`);
    await Deno.writeTextFile(
      `${testDir}/.config/ebo.toml`,
      `[vcs]
enabled = true
command = "git"
`,
    );

    const config = await loadVcsConfig(testDir);
    assertEquals(config.enabled, true);
    assertEquals(config.command, "git");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: hasWorkingCopyChanges returns false when no changes",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create initial commit so we have a valid repo
    await Deno.writeTextFile(`${testDir}/.gitkeep`, "");
    const add = new Deno.Command("git", {
      args: ["add", "."],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await add.output();
    const commit = new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await commit.output();

    const hasChanges = await hasWorkingCopyChanges(testDir, "git");
    assertEquals(hasChanges, false);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: hasWorkingCopyChanges returns true when file is modified",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create a file
    await Deno.writeTextFile(`${testDir}/test.txt`, "hello");

    const hasChanges = await hasWorkingCopyChanges(testDir, "git");
    assertEquals(hasChanges, true);

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: commitWork creates commit when changes exist",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create initial commit
    await Deno.writeTextFile(`${testDir}/.gitkeep`, "");
    const add = new Deno.Command("git", {
      args: ["add", "."],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await add.output();
    const commit = new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await commit.output();

    const countBefore = await countGitCommits(testDir);

    // Create a change
    await Deno.writeTextFile(`${testDir}/test.txt`, "hello");

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
      { enabled: true, command: "git" },
      testDir,
    );

    const countAfter = await countGitCommits(testDir);

    assertEquals(result.success, true);
    assertEquals(countAfter, countBefore + 1, "Should create one new commit");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: commitWork returns no changes when nothing to commit",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create initial commit
    await Deno.writeTextFile(`${testDir}/.gitkeep`, "");
    const add = new Deno.Command("git", {
      args: ["add", "."],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await add.output();
    const commit = new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await commit.output();

    const countBefore = await countGitCommits(testDir);

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
      { enabled: true, command: "git" },
      testDir,
    );

    const countAfter = await countGitCommits(testDir);

    assertEquals(result.success, true);
    assertEquals(result.message, "No changes to commit");
    assertEquals(countAfter, countBefore, "No new commit should be created");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: ensureCleanWorkingCopy returns clean when no changes",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create initial commit
    await Deno.writeTextFile(`${testDir}/.gitkeep`, "");
    const add = new Deno.Command("git", {
      args: ["add", "."],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await add.output();
    const commit = new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await commit.output();

    const result = await ensureCleanWorkingCopy(
      { enabled: true, command: "git" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "Working copy is clean");

    await Deno.remove(testDir, { recursive: true });
  },
});

Deno.test({
  name: "git: ensureCleanWorkingCopy stashes changes when they exist",
  async fn() {
    const testDir = await Deno.makeTempDir({ prefix: "ebo_vcs_test_" });
    await initGitRepo(testDir);

    // Create initial commit (needed for stash to work)
    await Deno.writeTextFile(`${testDir}/.gitkeep`, "");
    const add = new Deno.Command("git", {
      args: ["add", "."],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await add.output();
    const commit = new Deno.Command("git", {
      args: ["commit", "-m", "initial"],
      cwd: testDir,
      stdout: "null",
      stderr: "null",
    });
    await commit.output();

    // Create uncommitted changes
    await Deno.writeTextFile(`${testDir}/test.txt`, "hello");

    // Verify changes exist before
    const hasChangesBefore = await hasWorkingCopyChanges(testDir, "git");
    assertEquals(hasChangesBefore, true);

    const result = await ensureCleanWorkingCopy(
      { enabled: true, command: "git" },
      testDir,
    );

    assertEquals(result.success, true);
    assertEquals(result.message, "Stashed pre-existing changes");

    // After stash, the working copy should be clean
    const hasChangesAfter = await hasWorkingCopyChanges(testDir, "git");
    assertEquals(hasChangesAfter, false);

    // Verify the stash exists
    const stashList = new Deno.Command("git", {
      args: ["stash", "list"],
      cwd: testDir,
      stdout: "piped",
      stderr: "null",
    });
    const { stdout } = await stashList.output();
    const stashOutput = new TextDecoder().decode(stdout);
    assertEquals(stashOutput.includes("ebo: stashed before issue work"), true);

    await Deno.remove(testDir, { recursive: true });
  },
});
