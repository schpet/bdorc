# Agent Containers

Build containerized environments for running AI agents on your specific
projects. These examples show how to create agent containers for different
technology stacks.

## What is an Agent Container?

An agent container packages everything an AI coding agent needs:

- Base language runtime (Ruby, Rust, Node.js, etc.)
- Project dependencies and build tools
- Agent tools (claude code, beads, jj)
- Quality gate tooling (linters, formatters, test runners)

Containers provide isolation, reproducibility, and make it easy to run agents
without polluting your local environment.

## Base Image

bdorc provides a base image with all agent tooling pre-installed. Extend it with
your project's specific toolchain.

**Base image includes:** deno, claude code, beads (bd), jj, ripgrep

### Using the Base Image

```dockerfile
FROM ghcr.io/schpet/bdorc-agent:latest

# Add your project-specific tooling here

WORKDIR /workspace
```

### Building the Base Image Locally

If you want to build the base image yourself:

```bash
container build --tag bdorc-agent-base --file Containerfile.base .
```

Then reference it in your project's Containerfile:

```dockerfile
FROM bdorc-agent-base:latest

# Add your project-specific tooling here

WORKDIR /workspace
```

## Example: Rails Application

### Containerfile

```dockerfile
FROM ghcr.io/schpet/bdorc-agent:latest

USER root
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*
USER agent

# Install Ruby
RUN curl -fsSL https://github.com/rbenv/rbenv-installer/raw/HEAD/bin/rbenv-installer | bash
ENV PATH="/home/agent/.rbenv/bin:/home/agent/.rbenv/shims:${PATH}"
RUN rbenv install 3.3.0 && rbenv global 3.3.0

WORKDIR /workspace
```

### bdorc.toml

```toml
gates = [
  "bundle exec standardrb --fix-unsafely",
  "bundle exec rspec",
]

[vcs]
command = "jj"
```

## Example: Rust CLI

### Containerfile

```dockerfile
FROM ghcr.io/schpet/bdorc-agent:latest

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/home/agent/.cargo/bin:${PATH}"
RUN rustup component add clippy rustfmt

WORKDIR /workspace
```

### bdorc.toml

```toml
gates = [
  "cargo fmt --check",
  "cargo clippy -- -D warnings",
  "cargo test",
]

[vcs]
command = "jj"
```

## Example: Node.js/TypeScript

### Containerfile

```dockerfile
FROM ghcr.io/schpet/bdorc-agent:latest

USER root
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
USER agent

WORKDIR /workspace
```

### bdorc.toml

```toml
gates = [
  "npm test",
  "npx tsc --noEmit",
  "npx prettier --check .",
  "npx eslint .",
]

[vcs]
command = "jj"
```

## Running with Apple Container

[Apple Container](https://github.com/apple/container) is a lightweight container
runtime for macOS.

### Build

```bash
container build --tag my-agent .
```

### Run

```bash
# Interactive shell
container run -it --rm -v $(pwd):/workspace my-agent bash

# Run bdorc directly
container run -it --rm \
  -v $(pwd):/workspace \
  my-agent bdorc --dangerously-skip-permissions

# Limit iterations
container run -it --rm \
  -v $(pwd):/workspace \
  my-agent bdorc --dangerously-skip-permissions --max-iterations 5
```

## Tips

### Volume Mounts

Mount your project to `/workspace`:

```bash
-v /path/to/your/project:/workspace
```

For projects with dependencies, consider mounting cache directories:

```bash
# Node.js
-v node_modules_cache:/workspace/node_modules

# Rust
-v cargo_cache:/root/.cargo/registry

# Ruby
-v bundle_cache:/usr/local/bundle
```

### Cleanup

Remove stopped containers:

```bash
container rm $(container ps -aq)
```

Remove the image when done:

```bash
container rmi my-agent
```

### Commit Identity

By default, commits made inside containers are attributed to the host user's
identity (auto-detected from jj or git config). This provides a clear audit
trail of which human initiated the agent work.

**How it works:**

1. The justfile auto-detects identity from `jj config get user.name` or
   `git config user.name`
2. Identity is passed to containers via `JJ_USER` and `JJ_EMAIL` environment
   variables
3. If no identity is found, falls back to "Agent <agent@local>"

**Override with environment variables:**

Set `BDORC_JJ_USER` and `BDORC_JJ_EMAIL` before running container commands:

```bash
# Use custom identity for CI/CD or team setups
export BDORC_JJ_USER="CI Bot"
export BDORC_JJ_EMAIL="ci@example.com"
just container-shell
```

**Per-command override:**

```bash
BDORC_JJ_USER="Deploy Bot" BDORC_JJ_EMAIL="deploy@example.com" just container-run
```

**Check current identity inside container:**

```bash
echo "User: $JJ_USER, Email: $JJ_EMAIL"
jj log -r @ --no-graph -T 'author'
```

### Pre-installing Dependencies

For faster startup, install project dependencies in the Containerfile:

```dockerfile
# Copy just dependency files first
COPY package.json package-lock.json ./
RUN npm ci

# Or for Ruby
COPY Gemfile Gemfile.lock ./
RUN bundle install
```

This creates a cached layer with dependencies pre-installed.
