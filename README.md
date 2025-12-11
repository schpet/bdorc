# bdorc

Beads orchestrator for Claude Code. Runs Claude Code in a loop until all beads tasks are done, with quality gates.

## Usage

```bash
# Run in current directory (uses Deno defaults for quality gates)
deno run --allow-run --allow-read main.ts

# Run in a specific directory
deno run --allow-run --allow-read main.ts -d /path/to/project

# Skip permission prompts (for automated/CI use)
deno run --allow-run --allow-read main.ts --dangerously-skip-permissions

# Limit iterations
deno run --allow-run --allow-read main.ts -n 10
```

## How It Works

1. Reads ready issues from beads (`bd ready`)
2. Claims the first issue (sets status to `in_progress`)
3. Builds a prompt from issue details and runs Claude Code
4. Runs quality gates (test, typecheck, format, lint)
5. If gates pass, closes the issue
6. Repeats until no ready work

## Configuration

Create `.config/bdorc.toml` in your project to customize quality gates:

```toml
[gates]
test = "npm test"
typecheck = "npx tsc --noEmit"
format = "npx prettier --check ."
lint = "npx eslint ."
```

Commands are full shell commands as strings.

### Language Examples

**Node.js / TypeScript:**
```toml
[gates]
test = "npm test"
typecheck = "npx tsc --noEmit"
format = "npx prettier --check ."
lint = "npx eslint ."
```

**Rust:**
```toml
[gates]
test = "cargo test"
typecheck = "cargo check"
format = "cargo fmt --check"
lint = "cargo clippy -- -D warnings"
```

**Go:**
```toml
[gates]
test = "go test ./..."
typecheck = "go build ./..."
format = "gofmt -l ."
lint = "golangci-lint run"
```

**Python:**
```toml
[gates]
test = "pytest"
typecheck = "mypy ."
format = "black --check ."
lint = "ruff check ."
```

If no config file exists, defaults to Deno commands.

## CLI Options

```
-d, --dir <path>                Working directory (default: current)
-n, --max-iterations            Max loop iterations (default: 100)
-m, --model <model>             Claude model to use
--max-turns <n>                 Max turns for Claude Code
--dangerously-skip-permissions  Skip permission prompts
-q, --quiet                     Less output
-h, --help                      Show help
```

## Requirements

- [Deno](https://deno.land/)
- [Claude Code CLI](https://claude.ai/claude-code) (`claude` command)
- [Beads](https://github.com/steveyegge/beads) (`bd` command)
