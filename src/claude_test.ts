import { assertEquals } from "@std/assert";
import { buildIssuePrompt } from "./claude.ts";

Deno.test("buildIssuePrompt: includes id and title", () => {
  const prompt = buildIssuePrompt({
    id: "test-123",
    title: "Fix the bug",
    description: "There is a bug in the code",
  });

  assertEquals(prompt.includes("test-123"), true);
  assertEquals(prompt.includes("Fix the bug"), true);
  assertEquals(prompt.includes("There is a bug in the code"), true);
});

Deno.test("buildIssuePrompt: includes design notes when provided", () => {
  const prompt = buildIssuePrompt({
    id: "test-456",
    title: "Add feature",
    description: "Add a new feature",
    design: "Use the adapter pattern",
  });

  assertEquals(prompt.includes("Design notes:"), true);
  assertEquals(prompt.includes("Use the adapter pattern"), true);
});

Deno.test("buildIssuePrompt: includes acceptance criteria when provided", () => {
  const prompt = buildIssuePrompt({
    id: "test-789",
    title: "Implement login",
    description: "Implement user login",
    acceptance_criteria: "- Users can log in\n- Invalid credentials show error",
  });

  assertEquals(prompt.includes("Acceptance criteria:"), true);
  assertEquals(prompt.includes("Users can log in"), true);
});

Deno.test("buildIssuePrompt: handles null design and acceptance", () => {
  const prompt = buildIssuePrompt({
    id: "test-000",
    title: "Simple task",
    description: "Do something simple",
    design: null,
    acceptance_criteria: null,
  });

  assertEquals(prompt.includes("Design notes:"), false);
  assertEquals(prompt.includes("Acceptance criteria:"), false);
  assertEquals(prompt.includes("test-000"), true);
});

Deno.test("buildIssuePrompt: includes instructions", () => {
  const prompt = buildIssuePrompt({
    id: "test-111",
    title: "Any task",
    description: "Any description",
  });

  assertEquals(prompt.includes("Instructions:"), true);
  assertEquals(prompt.includes("Implement what's described above"), true);
});
