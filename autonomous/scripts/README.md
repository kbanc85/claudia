# Scripts

Helper scripts for roadmap execution. Empty for now. Add scripts as needed during phase work.

## What belongs here

- One-off helpers: `generate-compat-report.sh`, `count-hermes-refs.sh`, etc.
- Shared build/test invocations that aren't worth a full tooling setup
- Small Python or shell utilities that support execution but aren't part of the product itself

## What does not belong here

- Anything that should live in the product repo (`autonomous/fork/` submodule)
- Anything sensitive (API keys, tokens, deploy creds)
- Long-lived tooling — that goes in the product repo too

## Convention

If you add a script, give it a short header comment explaining what it does and what phase produced it. Example:

```bash
#!/usr/bin/env bash
# count-hermes-refs.sh — Phase 0.2 helper
# Counts remaining `hermes` references in user-facing files.
# Run from the claudia-autonomous fork repo root.
```
