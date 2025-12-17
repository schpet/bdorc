# https://just.systems

default:
    echo 'Hello, world!'

install:
    deno install -c ./deno.json -A -g -f -n bdorc ./main.ts

container-build-base:
    container build --tag bdorc-agent-base --file Containerfile.base .

container-build: container-build-base
    container build --tag bdorc-agent .

container-shell:
    container run -it --rm -v $(pwd):/workspace bdorc-agent bash

# run bdorc in the container for improved security
container-run *args:
    container run -it --rm -v $(pwd):/workspace bdorc-agent bdorc --dangerously-skip-permissions {{args}}
