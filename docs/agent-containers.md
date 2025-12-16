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

## Base Pattern

Every agent container follows this structure:

```dockerfile
FROM <language-base-image>

# Install agent tools
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:${PATH}"

RUN curl -fsSL -o /tmp/jj.tar.gz \
    "https://github.com/jj-vcs/jj/releases/download/v0.36.0/jj-v0.36.0-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/jj.tar.gz -C /usr/local/bin \
    && rm /tmp/jj.tar.gz

RUN apt-get update && apt-get install -y golang-go && rm -rf /var/lib/apt/lists/*
RUN go install github.com/steveyegge/beads/cmd/bd@latest
ENV PATH="${PATH}:/root/go/bin"

RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="${PATH}:/root/.local/bin"

RUN deno install -A -g -f -n bdorc jsr:@schpet/bdorc

RUN jj config set --user user.name "Agent" && \
    jj config set --user user.email "agent@local"

# Add project-specific setup here

WORKDIR /workspace
```

## Example: Rails Application

### Containerfile

```dockerfile
FROM ruby:3.3-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    ripgrep \
    golang-go \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (for bdorc)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Install jj (version control)
RUN curl -fsSL -o /tmp/jj.tar.gz \
    "https://github.com/jj-vcs/jj/releases/download/v0.36.0/jj-v0.36.0-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/jj.tar.gz -C /usr/local/bin \
    && rm /tmp/jj.tar.gz

# Install beads (bd)
RUN go install github.com/steveyegge/beads/cmd/bd@latest
ENV PATH="${PATH}:/root/go/bin"

# Install claude code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="${PATH}:/root/.local/bin"

# Install bdorc
RUN deno install -A -g -f -n bdorc jsr:@schpet/bdorc

# Configure jj
RUN jj config set --user user.name "Agent" && \
    jj config set --user user.email "agent@local"

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
FROM rust:1.82-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    ripgrep \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

# Install Rust components
RUN rustup component add clippy rustfmt

# Install Deno (for bdorc)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Install jj (version control)
RUN curl -fsSL -o /tmp/jj.tar.gz \
    "https://github.com/jj-vcs/jj/releases/download/v0.36.0/jj-v0.36.0-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/jj.tar.gz -C /usr/local/bin \
    && rm /tmp/jj.tar.gz

# Install beads (bd)
RUN go install github.com/steveyegge/beads/cmd/bd@latest
ENV PATH="${PATH}:/root/go/bin"

# Install claude code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="${PATH}:/root/.local/bin"

# Install bdorc
RUN deno install -A -g -f -n bdorc jsr:@schpet/bdorc

# Configure jj
RUN jj config set --user user.name "Agent" && \
    jj config set --user user.email "agent@local"

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
FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    ripgrep \
    golang-go \
    && rm -rf /var/lib/apt/lists/*

# Install Deno (for bdorc)
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# Install jj (version control)
RUN curl -fsSL -o /tmp/jj.tar.gz \
    "https://github.com/jj-vcs/jj/releases/download/v0.36.0/jj-v0.36.0-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/jj.tar.gz -C /usr/local/bin \
    && rm /tmp/jj.tar.gz

# Install beads (bd)
RUN go install github.com/steveyegge/beads/cmd/bd@latest
ENV PATH="${PATH}:/root/go/bin"

# Install claude code
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="${PATH}:/root/.local/bin"

# Install bdorc
RUN deno install -A -g -f -n bdorc jsr:@schpet/bdorc

# Configure jj
RUN jj config set --user user.name "Agent" && \
    jj config set --user user.email "agent@local"

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
container run --rm \
  -v $(pwd):/workspace \
  -e ANTHROPIC_API_KEY \
  my-agent bdorc --dangerously-skip-permissions

# Limit iterations
container run --rm \
  -v $(pwd):/workspace \
  -e ANTHROPIC_API_KEY \
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

### API Keys

Pass your Anthropic API key via environment variable:

```bash
-e ANTHROPIC_API_KEY
# or
-e ANTHROPIC_API_KEY="sk-ant-..."
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
