# https://just.systems

default:
    echo 'Hello, world!'

install:
		deno install -c ./deno.json -A -g -f -n bdorc ./main.ts
