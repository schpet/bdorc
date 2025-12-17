# https://just.systems

default:
	just -l -u

install:
    deno install -c ./deno.json -A -g -f -n bdorc ./main.ts

container-build-ghcr:
    container build --tag bdorc-agent .

container-build-base:
    container build --tag bdorc-agent-base --file Containerfile.base .

container-build-dev: container-build-base
    container build --tag bdorc-agent --file Containerfile.dev .

container-shell:
    container run -it --rm -m 4g -v $(pwd):/workspace -e CLAUDE_CODE_OAUTH_TOKEN bdorc-agent bash

# get oauth token: run this, login, then export CLAUDE_CODE_OAUTH_TOKEN=sk-...
container-login:
    container run -it --rm -m 4g bdorc-agent bash -c 'claude setup-token'

# start claude interactively (requires CLAUDE_CODE_OAUTH_TOKEN)
container-claude:
    container run -it --rm -m 4g -v $(pwd):/workspace -e CLAUDE_CODE_OAUTH_TOKEN bdorc-agent bash -c claude

container-update-claude:
    container run -it --rm -m 4g -e CLAUDE_CODE_OAUTH_TOKEN bdorc-agent bash -c 'claude update'

# run bdorc in the container for improved security
# requires: export CLAUDE_CODE_OAUTH_TOKEN=sk-...
container-run *args:
    container run --rm -m 4g -v $(pwd):/workspace -e CLAUDE_CODE_OAUTH_TOKEN bdorc-agent bash -c 'bdorc --dangerously-skip-permissions {{args}}'
