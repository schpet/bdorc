# https://just.systems

default:
	just -l -u

install:
    deno install -c ./deno.json -A -g -f -n bdorc ./main.ts

container-build-ghcr:
    container build --tag bdorc-agent .

container-build-base:
    container build -m 4g --tag bdorc-agent-base --file Containerfile.base .

container-build-dev: container-build-base
    container build --tag bdorc-agent --file Containerfile.dev .

# directory for persisting claude config between container runs
container-config-dir := env_var_or_default("BDORC_CONFIG_DIR", env_var("HOME") + "/.config/bdorc/container")

# jj identity for container commits (auto-detect from host, allow override)
jj-user := env_var_or_default("BDORC_JJ_USER", `jj config get user.name 2>/dev/null || git config user.name 2>/dev/null || echo "Agent"`)
jj-email := env_var_or_default("BDORC_JJ_EMAIL", `jj config get user.email 2>/dev/null || git config user.email 2>/dev/null || echo "agent@local"`)

# copy git global ignore to config dir (container CLI only supports directory mounts)
[private]
sync-git-ignore:
    #!/usr/bin/env bash
    mkdir -p {{container-config-dir}}
    ignore_file=$(git config --global core.excludesfile 2>/dev/null | sed "s|^~|$HOME|")
    if [ -n "$ignore_file" ] && [ -f "$ignore_file" ]; then
        cp "$ignore_file" {{container-config-dir}}/gitignore
    elif [ ! -f "{{container-config-dir}}/gitignore" ]; then
        # create minimal fallback if no host gitignore and none exists yet
        printf '.DS_Store\n*.swp\n*.swo\n*~\n.env\n.env.local\n' > {{container-config-dir}}/gitignore
    fi

container-shell: sync-git-ignore
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude -e JJ_USER="{{jj-user}}" -e JJ_EMAIL="{{jj-email}}" bdorc-agent bash

# start claude interactively (login on first run, credentials persist in ~/.config/bdorc/container)
container-claude: sync-git-ignore
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude -e JJ_USER="{{jj-user}}" -e JJ_EMAIL="{{jj-email}}" bdorc-agent bash -c claude

container-update-claude:
    mkdir -p {{container-config-dir}}
    container run -it --rm -m 4g -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude -e JJ_USER="{{jj-user}}" -e JJ_EMAIL="{{jj-email}}" bdorc-agent bash -c 'claude update'

# run bdorc in the container for improved security
# first run: use 'just container-claude' to login, then use this
container-run *args: sync-git-ignore
    container run --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude -e JJ_USER="{{jj-user}}" -e JJ_EMAIL="{{jj-email}}" bdorc-agent bash -c 'deno install -c /workspace/deno.json -A -g -f -n bdorc /workspace/main.ts && bdorc --dangerously-skip-permissions {{args}}'

# stop all running bdorc-agent containers
container-stop:
    #!/usr/bin/env bash
    ids=$(container list --format json | jq -r '.[] | select(.status == "running") | select(.configuration.image.reference | contains("bdorc-agent")) | .configuration.id')
    if [ -z "$ids" ]; then
        echo "No running bdorc-agent containers"
    else
        echo "$ids" | xargs -I {} container stop {}
    fi
