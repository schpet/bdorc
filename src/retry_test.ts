import { assertEquals } from "@std/assert";
import { isTransientClaudeError } from "./retry.ts";

Deno.test("isTransientClaudeError: detects JSON parsing errors", () => {
  const error = "Error: SyntaxError: Unexpected end of JSON input";
  assertEquals(isTransientClaudeError(error), true);
});

Deno.test("isTransientClaudeError: detects JSON parse errors", () => {
  const error = "SyntaxError: Unexpected token < in JSON at position 0";
  assertEquals(isTransientClaudeError(error), true);
});

Deno.test("isTransientClaudeError: detects connection errors", () => {
  const errors = [
    "Error: ECONNRESET",
    "Error: ETIMEDOUT",
    "Error: ECONNREFUSED",
    "Error: socket hang up",
    "NetworkError: Failed to fetch",
    "request to https://api.anthropic.com failed",
  ];

  for (const error of errors) {
    assertEquals(
      isTransientClaudeError(error),
      true,
      `Expected '${error}' to be transient`,
    );
  }
});

Deno.test("isTransientClaudeError: detects rate limits and overload", () => {
  const errors = [
    "Rate limit exceeded",
    "429 Too Many Requests",
    "503 Service Unavailable",
    "overloaded_error",
    "api_error: overloaded",
  ];

  for (const error of errors) {
    assertEquals(
      isTransientClaudeError(error),
      true,
      `Expected '${error}' to be transient`,
    );
  }
});

Deno.test("isTransientClaudeError: returns false for non-transient errors", () => {
  const errors = [
    "Permission denied",
    "File not found",
    "Invalid API key",
    "Authentication failed",
    "Claude couldn't complete the task",
    "",
  ];

  for (const error of errors) {
    assertEquals(
      isTransientClaudeError(error),
      false,
      `Expected '${error}' to NOT be transient`,
    );
  }
});

Deno.test("isTransientClaudeError: detects internal errors", () => {
  const errors = [
    "internal_error",
    "InternalError: something went wrong",
    "500 Internal Server Error",
  ];

  for (const error of errors) {
    assertEquals(
      isTransientClaudeError(error),
      true,
      `Expected '${error}' to be transient`,
    );
  }
});
