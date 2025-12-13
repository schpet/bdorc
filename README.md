# bdorc

beads orchestrator for claude code. processes beads issues as they become ready,
waiting for new work when idle. quality gates ensure code quality.

## install

```bash
deno install -A -g -f -n bdorc jsr:@schpet/bdorc
```

or, if you've cloned the repo:

```bash
deno install -c ./deno.json -A -g -f -n bdorc ./main.ts
```

## status

**this project is experimental and in early development.**

current limitations:

- runs claude code in a sequential for loop (no parallelization)
- only supports claude code as the agent (no support for other ai agents/models)

## usage

bdorc **requires** `--dangerously-skip-permissions` since it runs claude code
autonomously in a loop and cannot prompt for permissions.

```bash
# basic usage - run in continuous mode (streams output, runs indefinitely)
bdorc --dangerously-skip-permissions

# limit to 10 iterations
bdorc --dangerously-skip-permissions --max-iterations 10

# use a specific model
bdorc --dangerously-skip-permissions --model claude-sonnet-4-20250514

# quiet mode
bdorc --dangerously-skip-permissions --quiet
```

## how it works

1. runs quality gates first (if configured) and fixes any failures
2. checks for stale `in_progress` issues from previous runs
3. reads ready issues from beads (`bd ready`)
4. claims the first issue (sets status to `in_progress`)
5. builds a prompt from issue details and runs claude code
6. runs quality gates
7. if gates pass, closes the issue
8. repeats for ready issues, polling when idle

## configuration

create `.config/bdorc.toml` in your project to configure quality gates:

```toml
gates = [
  "npm test",
  "npx tsc --noEmit",
  "npx prettier --check .",
  "npx eslint .",
]
```

gates are run sequentially and must all pass for an issue to be closed.

### language examples

**deno:**

```toml
gates = [
  "deno fmt --check",
  "deno lint",
  "deno test -A",
]
```

**rust:**

```toml
gates = [
  "cargo test",
  "cargo check",
  "cargo fmt --check",
  "cargo clippy -- -D warnings",
]
```

if no config file exists, no gates are run.

## cli options

| flag                             | description                            | default             |
| -------------------------------- | -------------------------------------- | ------------------- |
| `-n, --max-iterations <count>`   | max loop iterations                    | infinity            |
| `-m, --model <model>`            | claude model to use                    | claude code default |
| `--max-turns <turns>`            | max turns per claude code session      | claude code default |
| `-q, --quiet`                    | less output                            | false               |
| `--dangerously-skip-permissions` | skip permission prompts (**required**) | -                   |
| `-h, --help`                     | show help                              | -                   |

## requirements

- [deno](https://deno.land/)
- [claude code cli](https://docs.anthropic.com/en/docs/claude-code) (`claude`
  command)
- [beads](https://github.com/steveyegge/beads) (`bd` command)
