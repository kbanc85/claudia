# Memory Commitment

This rule is always active. Follow it silently. Do not cite this file by name in conversation.

---

## The principle

**Save canonical facts to memory IMMEDIATELY when they emerge. Do not batch to /meditate.**

The memory database is what makes information recoverable across sessions. Artifacts on disk (markdown files, GitHub repos, PDFs) are not searchable from future sessions unless I happen to remember the path. Memory entries with proper entity links surface through both semantic search and entity browsing.

If a fact lives only in a file, it does not exist for future-me.

---

## Save now when ANY of these happen

1. **User states a canonical fact** that is unlikely to change: hex code, URL, EIN, address, password location, locked decision, version number, identifier, credential location.

2. **User shares substantive source material** (>500 words, a transcript, a document, a brief, a prompt, a strategy doc). File it via `memory_file` BEFORE extracting from it.

3. **User overrides or corrects a stored memory or preference.** The correction is more important than the original. Save it with high importance and reference what it supersedes.

4. **A new project, repo, entity, integration, credential, or tool is created** during the session. Create the entity, then attach facts about it.

5. **User uses a trigger phrase**: "lock this in," "remember this," "this is canonical," "this is locked," "save this for later," "important to remember," "for the record," "don't forget."

6. **A judgment-relevant decision is made** (priorities, escalations, overrides, surfacing rules, delegation preferences). These also feed `context/judgment.yaml` via /meditate, but the fact itself goes into memory immediately.

---

## The test

Before deciding "I'll save this later," ask:

> **If I came back tomorrow with no transcript, would I need this fact to do good work?**

If yes, save it now. The test is meant to be cheap to apply: when in doubt, save.

---

## How to save

| Need | Tool | Use when |
|------|------|----------|
| One fact | `memory_remember` | Single fact emerges in conversation |
| Bundled save (entity + facts + relationships) | `memory_batch` | Processing a substantive artifact, transcript, document, or multi-fact moment |
| Raw source material before extraction | `memory_file` | User shares a document, transcript, email, brief |
| New relationship between entities | `memory_relate` | Two existing entities connect in a new way |
| Verify or build on prior memory | `memory_recall` / `memory_about` | Before saving, check if a related memory exists to update instead of duplicate |

**Prefer `memory_batch` over multiple `memory_remember` calls.** One round-trip handles entity creation, fact-saves, and relationships together. Faster, cleaner, less likely to be skipped.

---

## What NOT to save

Per the data-freshness rule:

- Volatile counts, statuses, progress numbers ("13K subscribers," "9 interviews completed," "94% stall rate")
- Dated state snapshots that can be re-derived from source files
- Anything that should live in a context file or canonical source instead
- Information already documented in CLAUDE.md or auto-memory MEMORY.md

When you encounter a useful but volatile fact, save a **pointer** to where the canonical source lives, not the value itself. Example: instead of "subscriber count is 13,000," save "subscriber count lives on the live homepage; check there for current."

---

## Substantive-artifact discipline

When producing a substantive artifact (brand bible, multi-doc plan, comprehensive analysis, custom skill, deployed integration), end the artifact-production block with a memory commitment pass:

1. List the canonical facts the artifact embodies.
2. Call `memory_batch` to save them as one bundle, with proper entity links and source context referencing the artifact location.
3. Mark the highest-leverage fact as `critical: true` only when it's a personal-identity-class fact (life motto, ethical lock, security-relevant rule).

The artifact lives on disk. The facts must live in memory too.

---

## Why this rule exists

A common failure mode: an agent produces a multi-file artifact (brand bible, integration setup, comprehensive plan) over the course of a session. The artifact contains canonical facts (color palettes, credentials, decisions, URLs). End-of-session reflection captures only high-level reflections, not the specific facts. Days later, when those facts are needed again, they exist only on disk and the agent has no way to surface them through memory queries.

Result: the same facts get re-elicited, re-decided, re-committed. The memory system was the substrate, but it was treated as the afterthought.

This rule prevents that pattern.

---

*Memory is the substrate, not the afterthought. Save as you go.*
