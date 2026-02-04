---
name: databases
description: View all Claudia memory databases, switch between them, manage isolation. Triggers on "which database?", "switch workspace", "show databases", "list databases".
argument-hint: "[list|use|info|delete] [hash]"
---

# Databases

View all Claudia memory databases, see what's in each, and switch between them.

**Triggers:** `/databases`, `/db`, "show databases", "list my databases", "switch database", "which database am I using?"

---

## Argument Handling

Parse the user's input to determine the subcommand:

| Input | Subcommand |
|-------|------------|
| `/databases`, `/db`, "show databases", "list databases" | **list** |
| `/databases use <hash>`, "switch to <hash>", "use database <hash>" | **use** |
| `/databases info <hash>`, "database info", "show database <hash>" | **info** |
| `/databases delete <hash>`, "delete database <hash>" | **delete** |

If no subcommand is clear, default to **list**.

---

## List (Default)

Scan all Claudia databases and display their stats.

### Step 1: Find all databases

```bash
# List production databases
ls -la ~/.claudia/memory/*.db 2>/dev/null || echo "NO_PROD_DBS"

# List demo databases
ls -la ~/.claudia/demo/*.db 2>/dev/null || echo "NO_DEMO_DBS"
```

### Step 2: Get current database

The currently active database is determined by the memory daemon's configuration. Check the MCP config or environment:

```bash
# Check current working directory to compute expected hash
pwd | shasum -a 256 | head -c 12
```

### Step 3: Query each database for stats

For each `.db` file found, query it directly using sqlite3:

```bash
# For each database file, extract stats
# Replace <db_path> with actual path
sqlite3 "<db_path>" "
SELECT
    (SELECT value FROM _meta WHERE key = 'workspace_path') as workspace,
    (SELECT COUNT(*) FROM entities WHERE type = 'person') as people,
    (SELECT COUNT(*) FROM memories) as memories,
    (SELECT COUNT(*) FROM entities) as entities,
    (SELECT MAX(created_at) FROM memories) as last_memory
"
```

If `_meta` table doesn't exist or `workspace_path` is NULL, show "Unknown (legacy)".

### Step 4: Get file sizes

```bash
# Get file sizes in human-readable format
du -h ~/.claudia/memory/*.db 2>/dev/null
du -h ~/.claudia/demo/*.db 2>/dev/null
```

### Output Format

Present the results in a clean table:

```
## Claudia Databases

### Production (~/.claudia/memory/)

| # | Hash | Workspace | Size | People | Memories | Last Active |
|---|------|-----------|------|--------|----------|-------------|
| > | a1b2c3d4e5f6 | ~/projects/startup | 2.3 MB | 18 | 127 | 2h ago |
|   | 9z8y7x6w5v4u | ~/work/client-a | 890 KB | 3 | 22 | 3d ago |
|   | x7y8z9a0b1c2 | Unknown (legacy) | 156 KB | 0 | 5 | 14d ago |

### Demo (~/.claudia/demo/)

| # | File | Description | Size | People | Memories | Last Active |
|---|------|-------------|------|--------|----------|-------------|
|   | claudia-demo.db | Global demo | 1.1 MB | 12 | 19 | 1d ago |

> = currently active

---

**Actions:**
- `/databases use <hash>` - Switch to a different database
- `/databases info <hash>` - Deep dive into a specific database
- `/databases delete <hash>` - Delete a database (with confirmation)
```

Format "Last Active" as relative time (e.g., "2h ago", "3d ago", "14d ago").

---

## Use

Switch to a different database by modifying the MCP configuration.

### Step 1: Verify database exists

```bash
ls ~/.claudia/memory/<hash>.db 2>/dev/null || ls ~/.claudia/demo/<hash>.db 2>/dev/null
```

If not found, report error:
```
Database '<hash>' not found. Run `/databases` to see available databases.
```

### Step 2: Get workspace info from target database

```bash
sqlite3 "~/.claudia/memory/<hash>.db" "SELECT value FROM _meta WHERE key = 'workspace_path'" 2>/dev/null || echo "Unknown workspace"
```

### Step 3: Show warning and get confirmation

Before switching, warn the user:

```
**Database Switch**

You're about to switch from:
  **Current:** [current workspace path] ([current hash])

To:
  **Target:** [target workspace path] ([target hash])

This will modify your `.mcp.json` to set `CLAUDIA_DB_OVERRIDE`.
**You'll need to restart Claude Code for the change to take effect.**

Proceed? (yes/no)
```

### Step 4: Modify .mcp.json

If confirmed, update the `.mcp.json` file to add `CLAUDIA_DB_OVERRIDE` environment variable:

Read the current .mcp.json, then add or update the environment variable for the claudia-memory server:

```bash
# Check if .mcp.json exists
cat .mcp.json 2>/dev/null || echo "NO_MCP_JSON"
```

Then edit the file to add:
```json
{
  "mcpServers": {
    "claudia-memory": {
      "command": "...",
      "args": ["..."],
      "env": {
        "CLAUDIA_DB_OVERRIDE": "/Users/kamil/.claudia/memory/<hash>.db"
      }
    }
  }
}
```

### Step 5: Confirm and instruct user

```
**Database switched to:** [target hash]
   **Workspace:** [target workspace path]

**Action required:** Restart Claude Code for the change to take effect.
   - Exit this session (type `/exit` or close terminal)
   - Start a new `claude` session

To switch back to your original database, run `/databases use <original-hash>`.
```

---

## Info

Show detailed statistics about a specific database.

### Step 1: Verify database exists

```bash
ls ~/.claudia/memory/<hash>.db 2>/dev/null || ls ~/.claudia/demo/<hash>.db 2>/dev/null
```

### Step 2: Query detailed stats

```bash
sqlite3 "<db_path>" "
-- Workspace info
SELECT 'workspace' as section, key, value FROM _meta;

-- Entity breakdown
SELECT 'entity_type' as section, type, COUNT(*) as count FROM entities GROUP BY type;

-- Memory breakdown
SELECT 'memory_type' as section, type, COUNT(*) as count FROM memories GROUP BY type;

-- Relationship count
SELECT 'relationships' as section, 'total' as type, COUNT(*) as count FROM relationships;

-- Episode count
SELECT 'episodes' as section, 'total' as type, COUNT(*) as count FROM episodes;

-- Pattern count
SELECT 'patterns' as section, 'total' as type, COUNT(*) as count FROM patterns;

-- Prediction count (active)
SELECT 'predictions' as section, 'active' as type, COUNT(*) as count FROM predictions WHERE expires_at > datetime('now') OR expires_at IS NULL;

-- Recent activity
SELECT 'recent_24h' as section, 'memories' as type, COUNT(*) as count FROM memories WHERE created_at > datetime('now', '-24 hours');
"
```

### Step 3: List top entities

```bash
sqlite3 "<db_path>" "
SELECT name, type, importance,
       (SELECT COUNT(*) FROM memory_entities WHERE entity_id = entities.id) as memory_count
FROM entities
ORDER BY importance DESC, memory_count DESC
LIMIT 15
"
```

### Output Format

```
## Database Info: [hash]

**Workspace:** [path]
**Size:** [file size]
**Created:** [created_at from _meta]
**Last Activity:** [last memory created_at]

### Entity Breakdown
| Type | Count |
|------|-------|
| person | 18 |
| organization | 5 |
| project | 12 |
| concept | 3 |

### Memory Breakdown
| Type | Count |
|------|-------|
| fact | 89 |
| preference | 12 |
| observation | 8 |
| learning | 5 |
| commitment | 13 |

### Other Stats
- **Relationships:** 45
- **Episodes:** 23
- **Patterns:** 8
- **Active Predictions:** 3
- **Activity (24h):** 7 new memories

### Top Entities
| Name | Type | Memories |
|------|------|----------|
| Sarah Chen | person | 34 |
| Acme Corp | organization | 22 |
| Project Alpha | project | 18 |
...

---

**Actions:**
- `/databases use [hash]` - Switch to this database
- `/databases delete [hash]` - Delete this database
```

---

## Delete

Delete a database with explicit confirmation.

### Step 1: Check if target is current database

If the user is trying to delete the currently active database, refuse:

```
Cannot delete the currently active database.

Switch to a different database first using `/databases use <other-hash>`, then try again.
```

### Step 2: Verify database exists and gather info

```bash
ls ~/.claudia/memory/<hash>.db 2>/dev/null || ls ~/.claudia/demo/<hash>.db 2>/dev/null
```

Query stats to show what will be lost:

```bash
sqlite3 "<db_path>" "
SELECT
    (SELECT value FROM _meta WHERE key = 'workspace_path') as workspace,
    (SELECT COUNT(*) FROM entities WHERE type = 'person') as people,
    (SELECT COUNT(*) FROM memories) as memories,
    (SELECT COUNT(*) FROM episodes) as episodes
"
```

### Step 3: Show warning and require explicit confirmation

```
**Delete Database**

You're about to **permanently delete** the database:
  **Hash:** [hash]
  **Workspace:** [workspace path]
  **Contains:**
    - [X] people
    - [Y] memories
    - [Z] conversation episodes

**This action cannot be undone.**

Type "DELETE [hash]" to confirm, or "cancel" to abort.
```

Wait for the user to type the exact confirmation string.

### Step 4: Delete the file

Only after explicit confirmation:

```bash
rm ~/.claudia/memory/<hash>.db
rm ~/.claudia/memory/<hash>.db-shm 2>/dev/null
rm ~/.claudia/memory/<hash>.db-wal 2>/dev/null
```

### Step 5: Confirm deletion

```
**Database deleted:** [hash]

The following files were removed:
- ~/.claudia/memory/[hash].db
- ~/.claudia/memory/[hash].db-shm (if existed)
- ~/.claudia/memory/[hash].db-wal (if existed)
```

---

## Tone

- Keep output clean and scannable
- For destructive actions (delete, switch), be explicit about consequences
- Show relative times for "Last Active" (2h ago, 3d ago, etc.)
- When showing workspace paths, collapse home directory to `~` for readability

---

## Error Handling

**No databases found:**
```
No Claudia databases found.

This could mean:
- Claudia hasn't been set up yet (run `npx get-claudia`)
- The memory daemon hasn't been used yet
- Databases are in a non-standard location

Expected locations:
- Production: ~/.claudia/memory/*.db
- Demo: ~/.claudia/demo/*.db
```

**Database query fails:**
```
Could not query database [hash]: [error message]

The database file may be corrupted or locked by another process.
```

**Permission denied:**
```
Permission denied when accessing [path].

Check file permissions: `ls -la ~/.claudia/memory/`
```
