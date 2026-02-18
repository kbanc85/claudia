---
name: map-connections
description: Scan context files to extract entities and relationships into the memory system. Triggers on "who knows who?", "network graph", "map my connections", "extract relationships".
argument-hint: "[--incremental] [file-path]"
effort-level: high
---

# Map Connections

Scan context files to extract entities, relationships, and build a connection graph. This command populates the memory system with structured relationship data from markdown files.

## Usage

- `/map-connections` -- Full scan of people/, projects/, context/
- `/map-connections --incremental` -- Only scan files modified since last run
- `/map-connections [file-path]` -- Scan a specific file

## Trigger Words

Use this command when the user says:
- "map my connections", "build my network", "scan for relationships"
- "analyze my people files", "who knows who"
- "populate the graph", "extract entities from files"

## Workflow

### 1. Gather Files

Scan these directories for markdown files:
- `people/` - Relationship files
- `projects/` - Project documentation
- `context/` - User context files

For incremental mode, check file modification times against the last run timestamp (stored in `context/.map-connections-last-run`).

```
Read each .md file in people/, projects/, context/
Track: filename, content, modification time
```

### 2. Extract Entities from Each File

For each file, extract:

**Entity Name:** From filename or first heading
- `people/sarah-chen.md` -> "Sarah Chen" (type: person)
- `projects/website-redesign.md` -> "Website Redesign" (type: project)
- First `# Heading` in file overrides filename-based name

**Mentioned Entities:** Scan file content for:
- **People patterns:** Names in "works with [Name]", "client of [Name]", mentions of capitalized names
- **Organizations:** Company names, "works at [Org]", "employed by [Org]"
- **Projects:** "working on [Project]", project file references

**Attributes (Phase 2):** Look for structured data:
- **Geography:** "based in [City]", "from [City]", city/state mentions
- **Role:** "CEO of", "founder of", titles in file
- **Industry:** Keywords like "real estate", "finance", "tech"
- **Communities:** "member of [Group]", known groups (YPO, EO)

### 3. Extract Relationships

Identify explicit and implicit relationships. For each relationship, set `origin_type` honestly based on how you know it. The system automatically caps strength based on origin, so always use `strength: 1.0` and let the guards enforce the ceiling.

**Extracted Relationships** (origin_type: "extracted", ceiling: 0.8)
Explicitly stated in the file:
- "works with [Name]" -> `works_with`
- "client of [Name]" -> `client_of`
- "reports to [Name]" -> `reports_to`
- "invested in [Project]" -> `invested_in`
- "manages [Name]" -> `manages`
- "partner at [Org]" -> `partner_at`
- "advisor to [Name/Org]" -> `advisor_to`

**Inferred Relationships** (origin_type: "inferred", ceiling: 0.5)
Co-mentioned or contextually implied:
- Two people mentioned in the same file -> `mentioned_with`
- People in the same project file -> `collaborates_on`
- Same city + same industry -> `likely_connected`
- Same organization -> `colleagues`
- Same community group -> `community_connection`

### 4. Deduplicate and Resolve

Before creating entities:
1. Normalize names to canonical form (lowercase, no titles)
2. Check if entity already exists in memory via `memory.entities` (operation="search")
3. Merge new information with existing entity data
4. Track which entities are new vs updated

### 5. Store in Memory

Use `memory.batch` for efficiency:

```
memory.batch operations=[
  {op: "entity", name: "Sarah Chen", type: "person", description: "CEO at Acme Corp"},
  {op: "entity", name: "Acme Corp", type: "organization"},
  {op: "relate", source: "Sarah Chen", target: "Acme Corp", relationship: "works_at", strength: 1.0, origin_type: "extracted"},
  {op: "relate", source: "Sarah Chen", target: "Tom Miller", relationship: "works_with", strength: 1.0, origin_type: "inferred"},
  ...
]
```

For relationship `origin_type`:
- Explicitly stated in the file ("Sarah is CEO of Acme"): `origin_type: "extracted"`
- Co-mentioned or contextually implied: `origin_type: "inferred"`
- User told you directly: `origin_type: "user_stated"`

The system automatically caps strength based on origin. You don't need to manually calibrate. Just be honest about how you know, and always use `strength: 1.0`.

When re-encountering existing relationships, the system strengthens them incrementally (scaled by origin). Repeated evidence builds trust organically.

### 6. Report Results

Output format:

```markdown
## Connection Map Results

**Scan completed:** [timestamp]
**Files processed:** [count]

### New Entities ([count])

| Name | Type | Source |
|------|------|--------|
| Sarah Chen | person | people/sarah-chen.md |
| Acme Corp | organization | people/sarah-chen.md |
| Website Redesign | project | projects/website-redesign.md |

### New Relationships ([count])

| Source | Relationship | Target | Origin |
|--------|--------------|--------|--------|
| Sarah Chen | works_at | Acme Corp | extracted |
| Sarah Chen | collaborates_on | Website Redesign | extracted |
| Sarah Chen | mentioned_with | Tom Miller | inferred |

### Inferred Connections ([count])

| Entity A | Entity B | Reason | Origin |
|----------|----------|--------|--------|
| Sarah Chen | Jane Doe | Same city (Palm Beach) + industry (real estate) | inferred |

### Updated Relationships ([count])

| Relationship | Change |
|--------------|--------|
| Sarah Chen -> client_of -> Beta Inc | strengthened (re-encountered, extracted) |

### Summary

- **People:** [count] total ([new] new)
- **Organizations:** [count] total ([new] new)
- **Projects:** [count] total ([new] new)
- **Relationships:** [count] total ([new] new)

---
```

## Relationship Type Reference

| Type | Description | Example |
|------|-------------|---------|
| `works_with` | Professional collaboration | "Sarah works with Tom on sales" |
| `works_at` | Employment relationship | "Sarah is CEO at Acme" |
| `client_of` | Client relationship | "Acme is a client of ours" |
| `reports_to` | Reporting hierarchy | "Tom reports to Sarah" |
| `manages` | Management relationship | "Sarah manages the team" |
| `invested_in` | Investment relationship | "Fund invested in Acme" |
| `partner_at` | Partnership | "Sarah is partner at Firm" |
| `advisor_to` | Advisory relationship | "Sarah advises Startup" |
| `knows` | General acquaintance | Default for co-mentions |
| `collaborates_on` | Project collaboration | People in same project file |
| `colleagues` | Same organization | Inferred from org membership |
| `community_connection` | Shared community | Same group membership |
| `likely_connected` | Attribute-based inference | Same city + industry |

## Edge Cases

**Ambiguous names:**
- "Sarah" could match multiple Sarahs
- Use file context to disambiguate
- If uncertain, don't create relationship

**Self-references:**
- Don't create relationships where source = target
- Filter these during processing

**Duplicate relationships:**
- Check for existing relationship before creating
- Update strength if new confidence is higher

**Empty files:**
- Skip files with no extractable content
- Report as "skipped: [reason]"

## Notes

- This command is idempotent: running multiple times won't create duplicates
- Incremental mode is faster but may miss cross-file relationships
- For best results, run full scan periodically, incremental scan daily
- Save last run timestamp to `context/.map-connections-last-run`
