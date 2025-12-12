# bdorc

beads orchestrator for claude code. runs claude code in a loop until all beads
tasks are done, with quality gates.

## usage

```bash
# run in current directory (uses deno defaults for quality gates)
bdorc

# run in a specific directory
bdorc -d /path/to/project

# skip permission prompts (for automated/ci use)
bdorc --dangerously-skip-permissions

# limit iterations
bdorc -n 10
```

## how it works

1. reads ready issues from beads (`bd ready`)
2. claims the first issue (sets status to `in_progress`)
3. builds a prompt from issue details and runs claude code
4. runs quality gates (test, typecheck, format, lint)
5. if gates pass, closes the issue
6. repeats until no ready work

## configuration

create `.config/bdorc.toml` in your project to customize quality gates:

```toml
[gates]
test = "npm test"
typecheck = "npx tsc --noEmit"
format = "npx prettier --check ."
lint = "npx eslint ."
```

commands are full shell commands as strings.

### language examples

**node.js / typescript:**

```toml
[gates]
test = "npm test"
typecheck = "npx tsc --noEmit"
format = "npx prettier --check ."
lint = "npx eslint ."
```

**rust:**

```toml
[gates]
test = "cargo test"
typecheck = "cargo check"
format = "cargo fmt --check"
lint = "cargo clippy -- -D warnings"
```

**go:**

```toml
[gates]
test = "go test ./..."
typecheck = "go build ./..."
format = "gofmt -l ."
lint = "golangci-lint run"
```

**python:**

```toml
[gates]
test = "pytest"
typecheck = "mypy ."
format = "black --check ."
lint = "ruff check ."
```

if no config file exists, defaults to deno commands.

## cli options

```
-d, --dir <path>                working directory (default: current)
-n, --max-iterations            max loop iterations (default: 100)
-m, --model <model>             claude model to use
--max-turns <n>                 max turns for claude code
--dangerously-skip-permissions  skip permission prompts
-q, --quiet                     less output
-h, --help                      show help
```

## requirements

- [deno](https://deno.land/)
- [claude code cli](https://claude.ai/claude-code) (`claude` command)
- [beads](https://github.com/steveyegge/beads) (`bd` command)
