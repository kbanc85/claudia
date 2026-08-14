---
name: new-workspace
description: "Create a workspace skeleton for a new project, client, or venture. Gathers details, creates directory with populated templates, validates generated files, populates dashboard, and updates main dashboard. Use when user says \"new workspace\", \"new project\", \"new client setup\"."
effort-level: medium
---

# New Workspace

Create a complete workspace skeleton for a new project, client engagement, or venture.

## Trigger

- `/new-workspace [name]`
- "Set up a new workspace for..."
- "Create a project for..."
- "New client setup"

## Process

### 1. Gather Details

Ask the user for the essentials (don't interrogate, keep it natural):

| Field | Question | Required |
|-------|----------|----------|
| **Name** | "What should we call this workspace?" | Yes |
| **Type** | "Is this a client engagement, product, venture, or something else?" | Yes |
| **Contact** | "Who's the main contact or sponsor?" | No |
| **Phase** | "What phase are we starting in?" | No |
| **Fee** | "Any fee or budget to track?" | No |

Generate a URL-safe slug from the name:
- Lowercase, hyphens for spaces
- Remove special characters
- Example: "Acme Corp Redesign" becomes `acme-corp-redesign`

### 2. Create Workspace Skeleton

Create the directory structure under `workspaces/`:

```
workspaces/{{slug}}/
├── Dashboard.md          ← From _templates/Dashboard.md
├── Timeline.md           ← From _templates/Timeline.md
├── Pipeline.md           ← From _templates/Pipeline.md (if applicable)
├── meetings/             ← Empty, ready for meeting captures
├── deliverables/         ← Empty, ready for deliverable tracking
├── agreements/           ← Empty, ready for contracts
├── invoices/             ← Empty, ready for billing
└── interviews/           ← Empty, for assessment interviews (if applicable)
```

**Template population:**
- Copy templates from `workspaces/_templates/`
- Replace `{{project}}` with the workspace name
- Replace `{{project-slug}}` with the slug
- Replace `{{client}}`, `{{sponsor}}` with provided values (or leave as placeholders)
- Replace `{{filesystem_root}}` with the workspace path

### 3. Validate Generated Files

Before proceeding, verify all generated markdown files:

- Open each generated `.md` file and verify all markdown tables have proper formatting:
  - Header row, separator row, and data rows must each be on their own line
  - No merged header+separator lines (corruption signature: `| text |------|` on same line)
- If any broken tables are found, fix them before proceeding

### 4. Populate Dashboard

Fill in the workspace Dashboard.md with:
- Project name and quick links
- Initial phase in the phase tracker
- Any known deliverables or obligations
- Dataview queries pointed at the right subdirectories

### 5. Create First Timeline Entry

Add an initial entry to Timeline.md:
```
## {{date}} - Workspace Created
- Workspace set up for {{name}}
- Initial phase: {{phase}}
- Contact: [[{{contact}}]]
```

### 6. Update Main Dashboard (if exists)

If a main project dashboard exists (e.g., `Home.md` or a top-level dashboard), add a link to the new workspace.

### 7. Confirm

Show the user what was created:

```
**Workspace Created: {{name}}**

✓ Dashboard with phase tracker and dataview queries
✓ Timeline with creation entry
✓ Directory structure for meetings, deliverables, agreements
✓ All templates validated (no table corruption)

📂 Location: workspaces/{{slug}}/

What would you like to do first?
- Add a meeting or deliverable
- Set up phases in the dashboard
- Create an agreement from template
```

## Output Format

Keep it clean and actionable. Show what was created, where it lives, and what to do next.

## Judgment Points

Ask for confirmation on:
- Workspace name and slug (before creating)
- Which templates to include (not all workspaces need all templates)
- Whether to update the main dashboard

## Quality Checklist

- [ ] Slug is URL-safe and readable
- [ ] All templates populated with correct values
- [ ] All markdown tables render correctly (header, separator, and data rows on separate lines)
- [ ] Dataview queries point to correct subdirectories
- [ ] Timeline has initial entry
- [ ] Main dashboard updated (if applicable)
