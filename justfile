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

container-shell:
    mkdir -p {{container-config-dir}}
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash

# start claude interactively (login on first run, credentials persist in ~/.config/bdorc/container)
container-claude:
    mkdir -p {{container-config-dir}}
    container run -it --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c claude

container-update-claude:
    mkdir -p {{container-config-dir}}
    container run -it --rm -m 4g -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c 'claude update'

# run bdorc in the container for improved security
# first run: use 'just container-claude' to login, then use this
container-run *args:
    mkdir -p {{container-config-dir}}
    container run --rm -m 4g -v $(pwd):/workspace -v {{container-config-dir}}:/claude -e CLAUDE_CONFIG_DIR=/claude bdorc-agent bash -c 'bdorc --dangerously-skip-permissions {{args}}'
