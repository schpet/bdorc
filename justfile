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
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash

# start claude interactively (login on first run, credentials persist in ~/.config/bdorc/container)
container-claude: sync-git-ignore
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c claude

container-update-claude:
    mkdir -p {{container-config-dir}}
    container run -it --rm -m 4g -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c 'claude update'

# run bdorc in the container for improved security
# first run: use 'just container-claude' to login, then use this
container-run *args: sync-git-ignore
    container run --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c 'bdorc --dangerously-skip-permissions {{args}}'
