# easy-bead-oven

beads orchestrator for claude code. processes beads issues as they become ready,
waiting for new work when idle. quality gates ensure code quality.

## install

```bash
deno install -A -g -f -n ebo jsr:@schpet/easy-bead-oven
```

or, if you've cloned the repo:

```bash
deno install -c ./deno.json -A -g -f -n ebo ./main.ts
```

## status

**this project is experimental and in early development.**

current limitations:

- runs claude code in a sequential for loop (no parallelization)
- only supports claude code as the agent (no support for other ai agents/models)

## usage

ebo **requires** `--dangerously-skip-permissions` since it runs claude code
autonomously in a loop and cannot prompt for permissions.

```bash
# basic usage - run in continuous mode (streams output, runs indefinitely)
ebo --dangerously-skip-permissions

# limit to 10 iterations
ebo --dangerously-skip-permissions --max-iterations 10

# use a specific model
ebo --dangerously-skip-permissions --model claude-sonnet-4-20250514

# quiet mode
ebo --dangerously-skip-permissions --quiet
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

create `.config/ebo.toml` in your project to configure quality gates:

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

### reviews

reviews are custom prompts that run after each issue is completed but before
it's closed. they receive the diff and can make additional changes. useful for
enforcing project-specific standards:

```toml
# example .config/ebo.toml
gates = [
  "bundle exec standardrb --fix-unsafely",
  "bundle exec rspec",
  "pnpm run type-check",
]

[vcs]
command = "jj"

[[reviews]]
prompt = "ensure no authorization errors are introduced"

[[reviews]]
prompt = "remove any excessive or unnecessary comments"
```

reviews run sequentially. each review sees the current diff and can fix issues
it finds. if a review makes changes, subsequent reviews see the updated diff.

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

## container

a pre-built container image is available with all ebo dependencies:

```bash
docker pull ghcr.io/schpet/ebo-agent:latest
```

the image includes everything needed to run ebo: deno, claude code, beads (bd),
jj, and ripgrep. compatible with Docker, Podman, and Apple's
[container](https://github.com/apple/container) tool.

### build

to build locally (or extend the base image with project-specific tooling):

```bash
container build --tag ebo-agent .
```

### run

```bash
# interactive shell
container run -it --rm -v $(pwd):/workspace ebo-agent bash

# run ebo directly
container run -it --rm \
  -v $(pwd):/workspace \
  ebo-agent ebo --dangerously-skip-permissions
```

### authenticate claude code

before running ebo, you need to authenticate claude code inside the container:

```bash
# start interactive shell
container run -it --rm -v $(pwd):/workspace ebo-agent bash

# inside the container, run claude to start auth flow
claude
```

this will prompt you to authenticate via browser (for Max subscription) or enter
an API key.

the container authentication approach is based on
[nezhar/claude-container](https://github.com/nezhar/claude-container), which
uses persistent credential storage via `CLAUDE_CONFIG_DIR`.

### update claude code

the container ships with a specific version of claude code. to update to the
latest version:

```bash
container run -it --rm -v $(pwd):/workspace ebo-agent claude update
```

### notes

- `-v $(pwd):/workspace` mounts your current directory into the container at
  `/workspace`
- the container includes: deno, claude code, beads (bd), jj, ripgrep
