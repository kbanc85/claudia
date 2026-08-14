---
name: build-team
description: "Propose and, after approval, configure a personalized team of Codex subagent roles based on the user's profile, goals, and working style."
---

# Build a Claudia Team for Codex

Design a small team that extends Claudia without fragmenting her judgment or relationship context.

## 1. Load context

Use `claudia-core`, call `memory_briefing`, then read `context/me.md`, `context/judgment.yaml`, current projects, and any existing `[agents]` entries in `.codex/config.toml`.

## 2. Propose before writing

Recommend no more than five roles. For each role show:

- role name and job;
- evidence from the user's actual work;
- tasks it should handle;
- what stays with Claudia;
- permissions or tools it needs;
- expected frequency of use.

Keep relationship judgment, strategy, and consequential external actions with Claudia. Ask for approval before changing configuration.

## 3. Configure approved roles

Codex roles belong in `.codex/config.toml`:

```toml
[agents.reviewer]
description = "Review a deliverable for evidence, clarity, and execution risk."
config_file = "./agents/reviewer.toml"
```

Put the role's model, reasoning, permissions, and developer instructions in `.codex/agents/<role>.toml`. Resolve `config_file` relative to `.codex/config.toml`. Preserve existing config and create a `.bak` before changing an existing role.

Use the user's current Codex model unless there is a concrete reason to choose another. Give read-only reviewers the narrowest permissions that work.

## 4. Verify

Validate the TOML, summarize exactly what changed, and tell the user to start a new Codex session. Do not claim the team is active until Codex loads the new configuration.

