---
name: wiki
description: Maintain Claudia's wiki, a directory of synthesized Markdown pages about your active entities (people, projects, organizations, topics). Each page is written by Claudia from raw memories, cites its sources, flags contradictions, and grows over time. Use when user says "write a wiki page for [entity]", "what do you know about [entity]" (returns the wiki page if it exists), "update the wiki on [entity]", or after ingesting substantial new content about an active entity. Replaces PARA as the default vault structure for new installs.
effort-level: medium
invocation: contextual
---

# Wiki

A persistent, navigable, LLM-maintained reference. The wiki is the third tier of Claudia's memory: raw memories live in SQLite, derived signals (entities, reflections, patterns) live in the daemon, and **synthesized topic pages** live here, in the user's Obsidian vault at `~/.claudia/vault/Wiki/`.

This skill is how I write those pages.

## What the wiki is for

| Today (without wiki) | With wiki |
|----------------------|-----------|
| "What's going on with Sarah?" forces me to re-synthesize from raw memories every time. | I check `Wiki/Sarah-Chen.md`. If it's fresh, the answer is already there. |
| Important entities accumulate scattered memories with no narrative. | Each active entity has one page that grows with use. |
| Contradictions in what I've been told sit silently. | Contradictions get flagged at the top of the page when I write it. |
| Memory dumps for important entities are unreadable. | Wiki pages are readable; the user can open them in Obsidian. |

The wiki is **synthesized once at ingest time**, not re-derived at every query. That's the key contrast with raw memory recall.

## Where wiki pages live

`~/.claudia/vault/Wiki/<entity-name>.md`

The vault root is the user's existing Obsidian vault (or it gets created on first wiki write). Each page is a single Markdown file. Filename matches the canonical entity name with spaces converted to hyphens (`Sarah Chen` → `Sarah-Chen.md`).

The `Wiki/` subdirectory sits alongside any existing PARA folders (`Active/`, `Relationships/`, etc.) for users already syncing to PARA. New installs default to wiki-only. Existing PARA users keep PARA running until they opt to migrate.

## When I write a wiki page

I write a wiki page proactively in these situations:

1. **After capturing a meeting** with a key person, organization, or project mentioned. If the wiki page for the entity doesn't exist or is stale, I update it.
2. **After filing a document** that contains substantive new information about an active entity.
3. **After ingesting multiple sources** that touch the same entity.
4. When the user **explicitly asks** ("write a wiki page for [entity]", "update the wiki on [entity]").

I write a wiki page **on-demand** when:

5. The user asks "what's going on with [entity]?" or "what do you know about [entity]?" and either no page exists or the existing page is older than the most recent memory about the entity.

**I do NOT write a wiki page when:**

- The entity is dormant (no mentions in the last 60 days). Dormant entities stay in raw memory only.
- I would only have one or two memories to work from. The page would be too thin to earn its keep.
- The entity is sensitive in a way that suggests the user wouldn't want a synthesized page (medical, deeply personal). Stay in raw memory.

## Page structure

Every wiki page follows this template:

```markdown
---
entity: "Sarah Chen"
entity_type: person
last_updated: 2026-05-15
source_memories: [142, 278, 391, 412, 487]
contradiction_count: 0
---

# Sarah Chen

> One-sentence TLDR for Claudia and the user to read first.

## At a glance

- **Role:** VP of Engineering at Acme Corp [mem:278]
- **First contact:** 2025-11-12 via James [mem:142]
- **Last interaction:** 2026-05-08, intro call with the design team [mem:487]
- **Communication style:** Email over Slack, mornings only [mem:391]

## What matters to her

(Synthesized prose from accumulated memories. Each meaningful claim cites the memory it came from. Aim for clarity, not completeness; this is a working reference, not a dossier.)

## Current threads

- **Acme rebrand engagement:** waiting on her sign-off on the proposal [mem:487]
- **(other open threads)**

## History

- 2026-05-08: Intro call with design team [mem:487]
- 2026-03-22: Sent the engagement scope [mem:412]
- (more history, newest first)

## Related

- [[Acme Corp]]
- [[James (introducer)]]
- [[Acme rebrand engagement]]
```

Required elements:
- **YAML frontmatter** with `entity`, `entity_type`, `last_updated`, `source_memories` (list of memory IDs that contributed to this version of the page), `contradiction_count`.
- **TLDR** in a blockquote at the top. One sentence that answers "what's the deal with this entity?"
- **Citations** as `[mem:NNN]` after each load-bearing claim. The user can trace any fact back to its source.
- **Cross-references** as `[[Entity Name]]` Obsidian wikilinks. These power the graph view.

Optional sections (use what fits):
- "At a glance" for quick facts
- "What matters to them" for preferences, motivations, values
- "Current threads" for open commitments and projects
- "History" reverse-chronological log of interactions
- "Contradictions" at the top, if any (see below)

## Contradictions

When two memories about the same entity disagree, the wiki page must surface it. Add a section directly after the TLDR:

```markdown
## ⚠ Contradictions to resolve

- **Role:** Listed as "VP of Engineering" in the kickoff notes [mem:142] but "CTO" in the org chart shared 2026-04-01 [mem:412]. Ask user which is current.
```

Update `contradiction_count` in the frontmatter to match. When a contradiction is resolved (user clarifies), strike through the obsolete claim in the relevant section and add a note.

## Writing process (workflow)

When I'm asked to write or update a wiki page for an entity:

1. **Check if a page already exists.** Use the Read tool on `~/.claudia/vault/Wiki/<entity-name>.md`. If it exists, read it. Note the `source_memories` list in the frontmatter, those are the memories already incorporated.
2. **Query memories about the entity.** Use the `memory_about` or `memory_recall` MCP tool to get all memories tagged to this entity. Note which memory IDs are NEW relative to the existing page.
3. **Decide: incremental update or full rewrite.**
   - If there's an existing page and only 1-3 new memories: incremental. Add new facts to relevant sections, append to "History", update the TLDR if warranted.
   - If there's no page, or 5+ new memories since the last update, or the page is older than 60 days: full rewrite. Build the page from scratch using all memories.
4. **Synthesize the page** following the template. Cite every meaningful claim. Flag contradictions explicitly.
5. **Save** using the Write tool to `~/.claudia/vault/Wiki/<entity-name>.md`. Update `last_updated`, append new memory IDs to `source_memories`, refresh `contradiction_count`.
6. **Cross-link.** If the page references other entities, ensure those entities have wiki pages too. If not and they're active, queue them for later (don't recursively write the whole graph).

## Read workflow (when user asks about an entity)

When the user asks "what do you know about X?", "what's going on with X?", etc:

1. Check if `Wiki/<X>.md` exists.
2. If yes and `last_updated` is within 7 days of the most recent memory about X: read the page, answer from it, mention you're reading from the wiki page (so the user knows it's a synthesized view).
3. If yes but stale: read the existing page, query for new memories, summarize what's new, and offer to update the wiki page.
4. If no page exists: do a regular memory query as before, AND offer to write a wiki page now if the entity is active enough to warrant one.

## Replaces PARA as the default

For new Claudia installs, the wiki is the canonical projection of memory into the vault. The old PARA mechanical-dump (entity rows extracted to `Active/`, `Relationships/`, etc.) is deprecated.

**For users with existing PARA vaults:** the old PARA structure is preserved. Both `Wiki/` and the existing PARA folders coexist. The user can migrate (or not) at their own pace. The `claudia-memory --migrate-to-wiki` CLI flag (when it ships in a future release) will copy the PARA structure aside and regenerate wiki pages from raw memories.

**Config:** A single setting in `~/.claudia/config.json`:

```json
{
  "vault_mode": "wiki"
}
```

Values:
- `"wiki"` (default for new installs): wiki pages get written on ingest. PARA sync is skipped.
- `"para"`: PARA mechanical dump runs as before (for backward compatibility). Wiki pages are not auto-written but can be invoked manually.
- `"both"`: PARA runs AND wiki writes happen on ingest. Higher cost, redundant. Mostly useful during migration.

If `vault_mode` is unset and the existing vault has PARA folders, treat as `"para"`. Otherwise treat as `"wiki"`.

## What the wiki is NOT

- **Not Wikipedia.** Pages are about *the user's* working set, not the general world. "Sarah Chen" is the Sarah the user actually works with, not the public figure.
- **Not a comprehensive dossier.** Pages should be useful at a glance. Aim for 300 to 1500 words per page, with longer pages reserved for entities the user interacts with daily.
- **Not a replacement for raw memory.** Every wiki page is *derived from* raw memories. The raw memories are still the source of truth. Wiki pages are the synthesized view.
- **Not a place for sensitive personal information.** If a memory contains sensitive content (medical, deeply personal), keep it in raw memory only and do not surface it in the wiki page unless the user explicitly asks.

## Style

Wiki pages should:
- Be readable as standalone Markdown. The user might open them in Obsidian without my mediation.
- Cite every load-bearing claim with `[mem:NNN]`. Trust requires traceability.
- Use plain language. No em dashes (project style rule). Direct sentences.
- Stay scoped to what's useful, not what's comprehensive.

See also: `vault-awareness` for the vault path conventions; `memory-manager` for the underlying memory lifecycle that feeds the wiki; `file-document`, `capture-meeting`, and `ingest-sources` for the ingestion paths that should trigger wiki writes.

## Open questions for future versions

- Automatic refresh queue (mark entities as "dirty" on ingest, batch refresh later) is not in this skill. Today, wiki writes are explicit. A future PR may add daemon-side auto-triggering.
- Wiki search (find pages by topic, not just entity name) is not yet a thing. Today, Obsidian's own search handles this.
- The `--migrate-to-wiki` CLI is named but not yet implemented. Users on PARA stay on PARA until that CLI ships.
