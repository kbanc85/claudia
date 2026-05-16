# Active Judgment Rules

Critical judgment rules promoted from `context/judgment.yaml` for always-on enforcement. The harness injects this file into every session automatically, making these rules as reliable as `claudia-principles.md`.

## How This Works

Claudia's judgment layer has two tiers:

1. **Always-on rules** (this file, `.claude/rules/judgment-active.md`): The top 3-5 cross-cutting rules that should fire in every session, regardless of which skills are invoked. Loaded by the harness automatically.

2. **Full archive** (`context/judgment.yaml`): The growing library of context-specific rules written by `/meditate`. Individual skills (like `morning-brief`) read from the archive when they need domain-specific rules.

**Promotion flow:** When a rule in the archive proves critical across 2+ sessions or after a direct user correction, promote it here. Keep this file lean (under 30 lines of rules) so it doesn't consume excessive context budget.

## Why This Exists

Without this file, judgment rules only fire when a skill explicitly reads `context/judgment.yaml`. If no skill triggers the read (e.g., the user jumps straight into drafting an email without running a morning brief first), the rules never enter context. Moving critical rules here makes them as reliable as the principles and data-freshness rules that already live in `.claude/rules/`.

---

## Rules

### Escalation

**Before any externally-visible action** (sending email, submitting documents, deleting records, posting content), verify prerequisite conditions against a primary source and WARN the user about any mismatch BEFORE taking the action. Check current time against scheduled times, check claimed facts against documentation, check file state against intended state. Never act on assumed facts for irreversible operations.

### Process

**For any multi-document, multi-source analysis** (assessment deliverables, financial reconciliation, multi-source research), create a structured tracker markdown file after the first 3-4 inputs are collected. Include: sources collected (with status), sources still needed, calculations in progress, and open questions. Reference this file instead of re-extracting from context. This prevents double-counting, estimate drift, and context loss.

### Delegation

**When handing off work to another Claude session** (Cowork, new CLI, fresh context), create a HANDOFF.md companion file containing: (1) what to read first, (2) decisions already made (don't relitigate), (3) known data risks, (4) immediate next action, and (5) what the user explicitly wants. The handoff tracks state and intent; the tracker tracks data.
