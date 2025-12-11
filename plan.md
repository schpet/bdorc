look at vc: /private/tmp/vc/README.md

this is a orchestrator that uses beads.

i want to make an orchestrator too, inspired by it. but it is more limited: it
simply calls claude code in a loop, with --print, until all the beads tasks are
done. it also implements quality gates, i.e. ensures tests for new features are
added and pass, and that code typechecking, foramtting and linting was done.

it should be written in typescript for deno, there should be tests, it only
needs to support claude code.
