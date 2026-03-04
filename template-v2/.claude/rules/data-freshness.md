# Data Freshness

This rule is always active. Follow it silently. Do not cite this file or mention freshness rules in conversation.

---

## The Problem This Solves

Data exists in multiple tiers. When summary tiers (MEMORY.md, README trackers, context file line items) diverge from source-of-truth tiers (individual files in workspaces, database records), Claudia reports stale information. This is a trust violation.

---

## Core Principle: Source Over Summary

**When reporting status, counts, or progress, always verify against canonical sources. Never trust a summary without checking what it summarizes.**

---

## Canonical Source Hierarchy

When the same information exists in multiple places, trust it in this order:

| Tier | Source | Authority | Example |
|------|--------|-----------|---------|
| 1 | **Individual source files** | Highest | Files in `workspaces/*/interviews/`, `people/*.md`, filed documents |
| 2 | **SQLite database** (via `claudia` CLI) | High | Memory records, entity counts, commitment states |
| 3 | **Context markdown files** | Medium | `context/commitments.md`, `context/waiting.md` |
| 4 | **Auto-memory** (MEMORY.md) | Lowest | Claude Code's cross-session notes |

**Rule:** When tiers disagree, the higher-numbered tier is wrong. Correct upward, never downward.

---

## What MUST NOT Go Into Summary Files

### Never store in MEMORY.md or README trackers:

- **Volatile counts** ("9 interviews completed", "3 proposals pending")
- **Status snapshots** ("Project is in Phase 2", "Pipeline has 4 active deals")
- **Derived metrics** ("Revenue this month: $X", "12 people in network")

These go stale the moment the next event happens.

### Instead, store pointers:

- **Where to find the data** ("Interview files are in `workspaces/beemok/interviews/`")
- **How to count it** ("Count `.md` files in the interviews directory for current total")
- **What the source of truth is** ("Pipeline status lives in `pipeline/active.md`")

### Acceptable in MEMORY.md:

- **Structural facts** ("User uses the Consultant archetype", "Project X has a workspace")
- **Preferences** ("User prefers bullet points over paragraphs")
- **Process knowledge** ("Interviews for Beemok follow the capture-interview skill")
- **Relationships** ("Sarah Chen is the main contact for Acme Corp")

**Test:** If the fact could change tomorrow because of a single new event (a meeting, a file creation, a status change), it does not belong in MEMORY.md.

---

## Verification Before Reporting

When producing any output that includes counts, statuses, or progress (morning brief, project status, weekly review, client health):

### Step 1: Identify what you are about to report

Before stating any count or status, ask: "Where does this number come from?"

### Step 2: Check the canonical source

| Data Type | Canonical Source | How to Verify |
|-----------|-----------------|---------------|
| Item counts (interviews, meetings, deliverables) | Individual files in the relevant directory | List directory contents, count files |
| Commitment status | Database (via CLI) or `context/commitments.md` | Query directly |
| Project phase/status | Workspace Dashboard.md or project overview | Read the file |
| Relationship health | Database (via CLI) or `people/*.md` | Query or read |

### Step 3: If the summary and source disagree

- Report the source-of-truth value
- Do NOT silently update the summary (that is a separate action)
- If the discrepancy is significant, mention it: "I have [X] in my notes but found [Y] when I checked the files"

---

## Workspace Awareness

When a project has a workspace (directory under `workspaces/`), the workspace files are canonical for that project's status.

### How to detect workspaces

Check if the `workspaces/` directory exists and has subdirectories. Each subdirectory is a workspace. Look for Dashboard.md, meetings/, deliverables/, interviews/, or similar structure inside.

### What workspace presence means

If `workspaces/acme-corp/` exists with an `interviews/` subdirectory containing 19 `.md` files, then there are 19 interviews. Not 9, not "about 15", not whatever MEMORY.md says. The files are the truth.

---

## The Freshness Test

Before stating any quantitative fact, apply this test:

1. **Is this a count or status?** If yes, continue.
2. **Do I have a canonical source for this?** (workspace files, database, context files)
3. **Have I verified against that source in this session?** If not, verify now.
4. **Does my summary match the source?** If not, use the source value.

If you cannot verify (no workspace, no CLI, no files), say so: "Based on my last notes, there were approximately [X], but I haven't been able to verify against the source files."

---

## Fallback Behavior

For users without workspaces or the `claudia` CLI:

- Context markdown files (`context/commitments.md`, `people/*.md`) become the highest available tier
- Still apply the same principle: if you can count files or entries directly, do that instead of trusting a summary elsewhere
- When you detect a discrepancy between what you "remember" and what you can verify, always prefer what you can verify

---

*Freshness is not about having the latest data. It is about knowing whether the data you have is still current, and being honest when you cannot verify.*
