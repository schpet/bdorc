FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    ripgrep \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.24 (required for beads)
RUN curl -fsSL -o /tmp/go.tar.gz "https://go.dev/dl/go1.24.0.linux-arm64.tar.gz" \
    && tar -C /usr/local -xzf /tmp/go.tar.gz \
    && rm /tmp/go.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"

RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

RUN curl -fsSL -o /tmp/jj.tar.gz \
    "https://github.com/jj-vcs/jj/releases/download/v0.36.0/jj-v0.36.0-aarch64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/jj.tar.gz -C /usr/local/bin \
    && rm /tmp/jj.tar.gz

RUN go install github.com/steveyegge/beads/cmd/bd@latest
ENV PATH="${PATH}:/root/go/bin"

# Install Node.js and claude code via npm
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code

RUN deno install -A -g -f -n bdorc jsr:@schpet/bdorc

RUN jj config set --user user.name "Agent" && \
    jj config set --user user.email "agent@local"

WORKDIR /workspace
