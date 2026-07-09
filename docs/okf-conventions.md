# OKF Authoring Conventions

This is the canonical conventions document every Claudia skill and builder
cites. If you are about to write a knowledge file, this is the standard.

## What OKF is

The [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
(OKF v0.1, draft) is Google's open format for agent-authored knowledge: a
directory of markdown files, each with a YAML frontmatter block and a markdown
body. It standardizes only the small set of structural rules needed to make a
knowledge corpus self-describing. One field is required, `type`; everything
else is recommended or free. All OKF field logic in this codebase lives in one
module, `memory-daemon/claudia_memory/okf.py` (marked `OKF_SPEC_VERSION`).

## The rule

**OKF is mandatory for what Claudia writes. Reads stay lenient.**

- Every knowledge file Claudia authors ships an OKF frontmatter block with a
  non-empty `type`.
- Claudia never validates-and-rejects a user's file. Missing fields, unknown
  fields, malformed YAML, broken links: all tolerated on read. `okf.py`'s
  `parse_frontmatter` never raises.

## Frontmatter fields

```yaml
---
type: person                       # REQUIRED, non-empty, from the vocabulary below
title: Sarah Chen                  # human display name
description: VP Engineering at Acme # one sentence
resource: https://...              # canonical URI, only if the concept has one
tags: [colleague, engineering]     # cross-cutting categorization
timestamp: 2026-07-09T14:30:00Z    # ISO 8601, last meaningful change
# ...extension fields (claudia_id, sync_hash, importance, ...) after core
---
```

Core fields are emitted in the order above (`type` first). Extension fields
(Claudia-specific) are kept alongside the OKF core; the spec explicitly permits
unknown keys. Nothing is deleted, fields are added and normalized.

## The house `type` vocabulary

OKF `type` is a free string, but everything Claudia authors is drawn from this
list so the corpus stays self-consistent (`okf.TYPE_VOCABULARY`):

| `type` | Used for |
|--------|----------|
| `person` | people (`people/*.md`) |
| `project` | projects (`projects/*/overview.md`) |
| `organization` | companies, clients |
| `concept` | abstract ideas, topics, reference notes |
| `location` | places |
| `context` | user profile / context files (`context/me.md`, learnings) |
| `meeting` | meeting notes and captures |
| `deliverable` | client deliverables |
| `commitment-ledger` | commitment / waiting trackers |
| `wiki-page` | synthesized wiki pages |
| `pattern` | Claudia's Desk pattern notes (vault) |
| `reflection` | Claudia's Desk reflections (vault) |
| `session-log` | session logs (vault) |
| `moc` | maps-of-content / index notes (vault) |
| `workspace-*` | the 9 workspace templates (agreement, dashboard, deliverable, interview, invoice, meeting, pipeline, theme, timeline) |

Pick the closest match. A new house type is a one-line addition to
`okf.TYPE_VOCABULARY` plus a row here, never an ad-hoc string in a template.

## Field reconciliation (Claudia dialects → OKF core)

Claudia had three pre-OKF frontmatter dialects. They converge on the OKF core
key while keeping the old key as an extension (nothing is removed):

| OKF core key | Canonical meaning | Legacy keys kept as extensions |
|--------------|-------------------|-------------------------------|
| `title` | display name | vault `name`, wiki `entity` |
| `type` | kind of concept | wiki `entity_type` |
| `timestamp` | last meaningful change (ISO 8601) | vault `updated`, wiki `last_updated` |

So a migrated vault entity note carries both `title:` and `name:`; a wiki page
carries both `type:` and `entity_type:`. The OKF key is canonical; the legacy
key stays for backward compatibility and existing tooling.

## `index.md` maintenance

`index.md` is a reserved OKF filename (§6): a per-directory listing for
progressive disclosure. It lets a human or agent see what a directory holds
before opening files.

Which directories get one: any directory that holds knowledge files, in
particular `people/`, `projects/`, `context/`, and, per archetype, their
equivalents (`clients/`, `pipeline/`, `finances/`, `accountability/`,
`insights/`). Generation ends by writing them.

Format (per OKF §6):

- **`index.md` carries NO frontmatter.** It is a listing, not a concept. (The
  one exception the spec allows: a bundle-root `index.md` MAY declare
  `okf_version: "0.1"`. Per-directory index files never do.)
- Body is one or more sections under `#` headings, each a bullet list. One
  bullet per file, showing the linked file's title and its one-line
  description:

  ```markdown
  # People

  * [Sarah Chen](sarah-chen.md) - VP Engineering at Acme
  * [Mike Johnson](mike-johnson.md) - Tech lead, orders platform
  ```

  When a directory holds files of more than one `type`, group them under one
  `#` heading per type so the type is visible without opening each file. When
  it holds a single type (the common case, e.g. `people/`), one section
  suffices and the type is implicit in the directory.
- Links are plain markdown, directory-relative. `reserved` files (`index.md`,
  `log.md`) are not listed.

`log.md` (§7) is also reserved (chronological history, no frontmatter). Claudia
does not author `log.md` today; the reserved name is simply left free.

## Cross-links

Links between concepts are plain markdown links. Bundle-relative links
(starting `/`) are preferred because they survive file moves. Broken links are
never an error, they may point at not-yet-written knowledge.

## What is exempt

- **Raw filed documents** (anything routed through `memory_file` /
  `documents.py` into `~/.claudia/files/`): stored as-is, byte-for-byte, with
  provenance in the database. Never rewritten, never given frontmatter. They
  are source material, not authored knowledge.
- **`.canvas` files** (Obsidian canvas JSON): not markdown concepts.
- **Skill `SKILL.md` config frontmatter**: that is Claude Code configuration,
  not a knowledge file.

## Migration story

Existing installs predate OKF. The `okf-normalize` admin command
(`claudia-memory --okf-normalize --project-dir <install>`) brings an install up
to standard:

- Additive and reversible: it only *adds* frontmatter, never touches body
  content (byte-for-byte preserved).
- Dry-run by default; `--apply` backs every file up to
  `~/.claudia/backups/okf-normalize-<date>/` before writing.
- Idempotent: a second run changes nothing.
- Files that already have conformant frontmatter (a non-empty `type`) are left
  alone; files with partial frontmatter get missing core fields added, nothing
  removed.

The vault projection (`vault_sync.py`) emits OKF-conformant frontmatter on
every sync, so vaults normalize themselves on the next sync with no separate
migration step.
