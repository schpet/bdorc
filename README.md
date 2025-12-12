# bdorc

beads orchestrator for claude code. processes beads issues as they become ready,
waiting for new work when idle. quality gates ensure code quality.

## usage

bdorc **requires** `--dangerously-skip-permissions` since it runs claude code
autonomously in a loop and cannot prompt for permissions.

```bash
# basic usage - run in continuous mode
bdorc --dangerously-skip-permissions

# stream claude code output in real-time (runs indefinitely by default)
bdorc --dangerously-skip-permissions --stream

# run in a specific directory
bdorc --dangerously-skip-permissions --dir /path/to/project

# limit to 10 iterations (one-shot style)
bdorc --dangerously-skip-permissions --max-iterations 10

# use a specific model
bdorc --dangerously-skip-permissions --model claude-sonnet-4-20250514

# quiet mode
bdorc --dangerously-skip-permissions --quiet
```

### continuous mode vs one-shot

**continuous mode** (default with `--stream`): runs indefinitely, polling for
new issues when idle. use this for long-running development sessions.

```bash
bdorc --dangerously-skip-permissions --stream
```

**one-shot mode**: processes available issues and exits. use `--max-iterations`
to limit work.

```bash
bdorc --dangerously-skip-permissions --max-iterations 5
```

## how it works

1. runs quality gates first (if configured) and fixes any failures
2. checks for stale `in_progress` issues from previous runs
3. reads ready issues from beads (`bd ready`)
4. claims the first issue (sets status to `in_progress`)
5. builds a prompt from issue details and runs claude code
6. runs quality gates
7. if gates pass, closes the issue
8. in stream mode, waits and polls for new work; in one-shot mode, exits when
   done

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

| flag                             | description                            | default                        |
| -------------------------------- | -------------------------------------- | ------------------------------ |
| `-d, --dir <path>`               | working directory                      | current directory              |
| `-n, --max-iterations <count>`   | max loop iterations                    | 100 (infinity with `--stream`) |
| `-m, --model <model>`            | claude model to use                    | claude code default            |
| `--max-turns <turns>`            | max turns per claude code session      | claude code default            |
| `-s, --stream`                   | stream claude code output in real-time | false                          |
| `-q, --quiet`                    | less output                            | false                          |
| `--dangerously-skip-permissions` | skip permission prompts (**required**) | -                              |
| `-h, --help`                     | show help                              | -                              |

## requirements

- [deno](https://deno.land/)
- [claude code cli](https://docs.anthropic.com/en/docs/claude-code) (`claude`
  command)
- [beads](https://github.com/anthropics/claude-code/tree/main/.agent-skills-marketplace/beads-marketplace)
  (`bd` command)
