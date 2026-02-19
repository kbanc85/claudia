---
name: vault-awareness
description: Teaches Claudia about the Obsidian vault projection of her memory, how to reference it, trigger syncs, and handle user edits.
user-invocable: false
effort-level: low
---

# Vault Awareness Skill

**Triggers:** User mentions Obsidian, vault, graph view, browsing memories, or asks about vault sync status.

---

## What the Vault Is

Claudia's memory lives in SQLite (the source of truth). The vault at `~/.claudia/vault/{project_id}/` is a **read projection**: markdown notes with YAML frontmatter and `[[wikilinks]]` that Obsidian can display, search, and graph.

### Vault Structure

```
vault/
  Home.md                    PARA navigation dashboard (regenerated each sync)
  Active/                    Projects with active attention
    Website Redesign.md
    _Index.md                MOC for active projects
  Relationships/
    people/                  Person entities (non-archived)
      Sarah Chen.md
      _Index.md              MOC grouped by attention tier
    organizations/           Organization entities (non-archived)
      Acme Corp.md
      _Index.md
  Reference/
    concepts/                Knowledge, frameworks, tools
      _Index.md
    locations/               Places
      _Index.md
  Archive/                   Dormant or archived entities
    people/
    projects/
    organizations/
  Claudia's Desk/            Claudia's efficient lookup zone
    MOC-People.md            Flat tier table (Claudia reads, ~0 MCP cost)
    MOC-Commitments.md       Commitment tracking table
    MOC-Projects.md          Project overview table
    patterns/                Detected pattern notes
    reflections/             Reflections from /meditate
    sessions/                Session logs (YYYY/MM/YYYY-MM-DD.md)
    _queries/                Dataview query templates (7 templates)
  canvases/                  Visual dashboards (.canvas files)
  _meta/                     Sync metadata (last-sync.json, sync-log.md)
  .obsidian/                 Obsidian config
    graph.json               Color groups by entity type
    app.json                 Readable line length, show frontmatter
    appearance.json          Enable claudia-theme CSS snippet
    workspace.json           Open Home.md on launch
    snippets/
      claudia-theme.css      Entity type emoji prefixes, tag colors
```

### How Notes Map to Memory

Each entity gets one markdown note with:
- **YAML frontmatter**: `claudia_id`, `type`, `name`, `importance`, `attention_tier`, `contact_trend`, `contact_frequency_days`, `last_contact`, timestamps, `aliases` (YAML list), compound `tags`, `cssclasses`, `sync_hash`
- **Status callout**: Attention tier, trend, last contact, frequency at a glance
- **Relationships table**: Connection, type, and strength in scannable table format
- **Key Facts**: Memories grouped by verification status (verified in `[!note]`, unverified in `[!warning]`)
- **Recent Interactions**: Last 10 session narratives in dated `[!example]` callout blocks
- **Wikilinks**: Relationships and session narratives use `[[Entity Name]]` links for graph connectivity
- **Sync footer**: Last sync timestamp

### PARA Routing Logic

Entities are routed to PARA directories based on their type and status:

- `attention_tier = "archive"` OR `contact_trend = "dormant"` → `Archive/{type}/`
- `entity_type = "project"` → `Active/`
- `entity_type = "person"` → `Relationships/people/`
- `entity_type = "organization"` → `Relationships/organizations/`
- `entity_type = "concept"` → `Reference/concepts/`
- `entity_type = "location"` → `Reference/locations/`

Archive routing takes precedence: a dormant person goes to `Archive/people/`, not `Relationships/people/`.

### Navigation

- **Home.md**: PARA navigation dashboard with active projects, relationship counts, needs-attention callouts, and quick links to Claudia's Desk
- **_Index.md**: Map of Content files in each PARA subdirectory, grouped by attention tier
- **Claudia's Desk/MOC-*.md**: Pre-computed flat tables for cheap reads (MOC-People, MOC-Commitments, MOC-Projects)
- **Dataview queries**: 7 templates in `Claudia's Desk/_queries/` (Upcoming Deadlines, Cooling Relationships, Active Network, Recent Memories, Open Commitments, Entity Overview, Session Log)

### Canvas Files

`.canvas` files are Obsidian-native visual boards:
- **relationship-map.canvas**: Entity graph with quadrant grouping by type (People top-left, Projects top-right, Orgs bottom-left, Concepts bottom-right) and color-coded nodes
- **morning-brief.canvas**: Commitments, alerts, recent activity, and reconnection suggestions
- **people-overview.canvas**: Person-to-person relationship graph (who works with whom)
- **project-*.canvas**: Per-project boards with connected people and tasks

### .obsidian Config

Ships on first sync (never overwrites existing files):
- **Graph colors**: person=green, project=red, organization=purple, concept=cyan, location=yellow, session=gray, pattern=orange, MOC=yellow
- **CSS theme**: Entity type emoji prefixes in Reading View, tag color pills matching graph
- **Workspace**: Opens Home.md with graph view in right sidebar

---

## When to Reference the Vault

### User asks to browse memories
Point them to the vault:
```
"Your memory vault is at ~/.claudia/vault/[project]/. Open it in Obsidian
to browse entities, relationships, and session logs. Home.md is your
dashboard, and the graph view shows how people and projects connect."
```

### User mentions Obsidian
Explain the integration:
```
"Your Obsidian vault syncs from my memory. Every entity becomes a note
with status callouts, relationship tables, and [[wikilinks]]. The graph
view is color-coded by entity type, and Home.md surfaces what needs attention."
```

### User asks about sync status
Use the MCP tool:
```
Call memory.vault(operation: "status") to check:
- When the last sync happened
- How many notes exist in each category
- The vault path
```

---

## Triggering a Sync

### Automatic
The vault syncs nightly at 3:15 AM (after consolidation), catching all changes from the day.

### On-Demand
When the user wants fresh data:
```
Call memory.vault(operation: "sync", full: false for incremental, full: true for complete rebuild)
```

Trigger a sync when:
- User asks "update the vault" or "sync to Obsidian"
- User is about to open Obsidian and wants current data
- After a large batch of memory operations

### Format Versioning

The vault uses `vault_format_version: 2` in `_meta/last-sync.json`. When upgrading from an older format, the sync automatically runs a full rebuild to migrate all notes to the new format.

---

## Generating Canvases

Users can request visual dashboards:

| Request | Action |
|---------|--------|
| "Show me my relationship map" | `memory.vault(operation: "canvas", canvas_type: "relationship_map")` |
| "Generate a morning brief canvas" | `memory.vault(operation: "canvas", canvas_type: "morning_brief")` |
| "Show people connections" | `memory.vault(operation: "canvas", canvas_type: "people_overview")` |
| "Make a project board for [name]" | `memory.vault(operation: "canvas", canvas_type: "project_board", project_name: "[name]")` |
| "Update all canvases" | `memory.vault(operation: "canvas", canvas_type: "all")` |

After generating, tell the user where to find it:
```
"Generated your relationship map at ~/.claudia/vault/[project]/canvases/relationship-map.canvas.
Open it in Obsidian to see the interactive graph."
```

---

## Deep Links

When referencing entities in conversation, generate `obsidian://` URIs so the user can jump directly to the note:

```
obsidian://open?vault=claudia-vault&file={para_dir}/{entity_name}
```

### Type-to-Directory Mapping (PARA)

| Entity Type | PARA Directory | Archive Directory |
|-------------|---------------|-------------------|
| person | Relationships/people | Archive/people |
| project | Active | Archive/projects |
| organization | Relationships/organizations | Archive/organizations |
| concept | Reference/concepts | (not archived) |
| location | Reference/locations | (not archived) |

Archived/dormant entities route to `Archive/{type}/`. Deep links must account for `attention_tier`/`contact_trend` to determine the correct path.

### Examples

- `obsidian://open?vault=claudia-vault&file=Relationships/people/Sarah%20Chen`
- `obsidian://open?vault=claudia-vault&file=Active/Website%20Redesign`
- `obsidian://open?vault=claudia-vault&file=Claudia's%20Desk/MOC-People`

### When to Include Deep Links

- Morning briefs: link each person/project mentioned
- Meeting prep: link to the person's note
- Relationship tracking: link entities when surfacing context
- Reconnection suggestions: link to the person's note

### Vault Name

The vault name defaults to `claudia-vault` but is configurable via `vault_name` in `~/.claudia/config.json`. URL-encode entity names with spaces.

---

## Bidirectional Sync

User edits in Obsidian can flow back to Claudia's memory. The sync uses `sync_hash` in YAML frontmatter to detect changes.

### Automatic Detection

Each entity note has a `sync_hash` in its frontmatter. When the note content changes (user edits), the hash no longer matches. Claudia detects this during import.

### What Gets Imported

| Edit Type | How It's Handled |
|-----------|------------------|
| Description changes | Entity description updated |
| New bullets in Key Facts | New memories created (origin: user_stated) |
| Checkbox completions (- [x]) | Commitment marked completed |
| Removed lines | Memory invalidated (reason: user_removed_from_vault) |

### Human Edits Always Win

All imported changes use `origin_type='user_stated'` and `confidence=1.0`. If there's a conflict between vault content and memory, the vault version takes priority.

### Running Import

- **MCP tool:** `memory.vault(operation: "import")` scans for changes and applies them
- **CLI:** `python3 -m claudia_memory --import-vault`
- **Nightly sync** continues as a safety net for anything missed

### User Guidance

```
"You can edit notes directly in Obsidian. Change descriptions, add facts,
check off completed commitments. Run /sync-vault or ask me to import your
edits and I'll update my memory to match."
```

---

## Vault Path Resolution

The vault path follows the same per-project isolation as the database:
- **Project-specific:** `~/.claudia/vault/{project_hash}/`
- **Global (no project):** `~/.claudia/vault/default/`

The `project_hash` is the same 12-char SHA256 used for database paths (`~/.claudia/memory/{project_hash}.db`).

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Vault folder empty | Run `memory.vault(operation: "sync", full: true)` or `python3 -m claudia_memory --vault-sync` |
| Stale data in Obsidian | Trigger an on-demand sync |
| Graph view shows no connections | Ensure entities have relationships (use `memory.relate`) |
| Graph all one color | Check `.obsidian/graph.json` exists (created on first sync) |
| Canvas won't open | Verify `.canvas` is valid JSON, regenerate with `memory.vault(operation: "canvas")` |
| Vault not updating overnight | Check scheduler is running via `memory.system_health` |
| Old format after upgrade | Sync will auto-rebuild when format version < 2 |
