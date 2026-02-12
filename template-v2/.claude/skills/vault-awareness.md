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
  people/           Entity notes for persons
  projects/         Entity notes for projects
  organizations/    Entity notes for organizations
  concepts/         Entity notes for concepts
  locations/        Entity notes for locations
  patterns/         Detected patterns
  reflections/      Reflections from /meditate
  sessions/         Daily session logs
  canvases/         Visual dashboards (.canvas files)
  _meta/            Sync metadata (last-sync.json, sync-log.md)
```

### How Notes Map to Memory

Each entity gets one markdown note with:
- **YAML frontmatter**: `claudia_id`, `type`, `importance`, timestamps, `sync_hash`
- **Wikilinks**: Relationships become `[[Entity Name]]` links (Obsidian's graph view shows these)
- **Memories**: Grouped by type (Key Facts, Commitments, Preferences, etc.)
- **Recent sessions**: Last 5 session narratives mentioning this entity

### Canvas Files

`.canvas` files are Obsidian-native visual boards:
- **relationship-map.canvas**: Full entity graph with color-coded nodes
- **morning-brief.canvas**: Commitments, alerts, recent activity dashboard
- **project-*.canvas**: Per-project boards with connected people and tasks

---

## When to Reference the Vault

### User asks to browse memories
Point them to the vault:
```
"Your memory vault is at ~/.claudia/vault/[project]/. Open it in Obsidian
to browse entities, relationships, and session logs. The graph view shows
how people and projects connect."
```

### User mentions Obsidian
Explain the integration:
```
"Your Obsidian vault syncs from my memory. Every entity, relationship, and
session log becomes a markdown note with [[wikilinks]] - so Obsidian's
graph view doubles as your relationship visualizer."
```

### User asks about sync status
Use the MCP tool:
```
Call memory.vault_status to check:
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
Call memory.sync_vault (full: false for incremental, full: true for complete rebuild)
```

Trigger a sync when:
- User asks "update the vault" or "sync to Obsidian"
- User is about to open Obsidian and wants current data
- After a large batch of memory operations

---

## Generating Canvases

Users can request visual dashboards:

| Request | Action |
|---------|--------|
| "Show me my relationship map" | `memory.generate_canvas(canvas_type: "relationship_map")` |
| "Generate a morning brief canvas" | `memory.generate_canvas(canvas_type: "morning_brief")` |
| "Make a project board for [name]" | `memory.generate_canvas(canvas_type: "project_board", project_name: "[name]")` |
| "Update all canvases" | `memory.generate_canvas(canvas_type: "all")` |

After generating, tell the user where to find it:
```
"Generated your relationship map at ~/.claudia/vault/[project]/canvases/relationship-map.canvas.
Open it in Obsidian to see the interactive graph."
```

---

## Deep Links

When referencing entities in conversation, generate `obsidian://` URIs so the user can jump directly to the note:

```
obsidian://open?vault=claudia-vault&file={type_dir}/{entity_name}
```

### Type-to-Directory Mapping

| Entity Type | Directory |
|-------------|-----------|
| person | people |
| project | projects |
| organization | organizations |
| concept | concepts |
| location | locations |

### Examples

- `obsidian://open?vault=claudia-vault&file=people/Sarah%20Chen`
- `obsidian://open?vault=claudia-vault&file=projects/Website%20Redesign`

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

- **MCP tool:** `memory.import_vault_edits` scans for changes and applies them
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
| Vault folder empty | Run `memory.sync_vault(full: true)` or `python3 -m claudia_memory --vault-sync` |
| Stale data in Obsidian | Trigger an on-demand sync |
| Graph view shows no connections | Ensure entities have relationships (use `memory.relate`) |
| Canvas won't open | Verify `.canvas` is valid JSON, regenerate with `memory.generate_canvas` |
| Vault not updating overnight | Check scheduler is running via `memory.system_health` |
