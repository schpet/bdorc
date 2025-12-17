# https://just.systems

default:
    echo 'Hello, world!'

install:
    deno install -c ./deno.json -A -g -f -n bdorc ./main.ts

container-build:
    container build --tag bdorc-agent .

container-build-base:
    container build --tag bdorc-agent-base --file Containerfile.base .

container-build-dev: container-build-base
    container build --tag bdorc-agent --file Containerfile.dev .

container-shell:
    container run -it --rm -v $(pwd):/workspace bdorc-agent bash

container-update-claude:
    container run -it --rm -v $(pwd):/workspace bdorc-agent claude update

# run bdorc in the container for improved security
container-run *args:
    container run --rm -v $(pwd):/workspace bdorc-agent bash -c 'bdorc --dangerously-skip-permissions {{args}}'
