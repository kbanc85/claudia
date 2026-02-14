---
type: workspace-dashboard
project: ""
client: ""
sponsor: ""
status: active
phase: ""
fee: 0
paid: 0
health: ""
filesystem_root: ""
sync:
  mappings: []
  slug_to_name: {}
tags:
  - workspace
---

# {{project}}

> [!info] Quick Links
> - Client: [[{{client}}]]
> - Sponsor: [[{{sponsor}}]]
> - Filesystem: `{{filesystem_root}}`

## Phase Tracker

| Phase | Description | Timeline | Status |
|-------|-------------|----------|--------|
| Phase 1 | | | |
| Phase 2 | | | |
| Phase 3 | | | |

## What We Owe Them

| Item | Status | Due | Notes |
|------|--------|-----|-------|

## What They Owe Us

| Item | Who | Status | Notes |
|------|-----|--------|-------|

## Interview Progress

```dataview
TABLE status, date, person
FROM "workspaces/{{project-slug}}/interviews"
SORT date DESC
```

## Deliverable Status

```dataview
TABLE status, evidence_strength
FROM "workspaces/{{project-slug}}/deliverables"
SORT file.name ASC
```

## Recent Meetings

```dataview
TABLE date, attendees, meeting_type
FROM "workspaces/{{project-slug}}/meetings"
SORT date DESC
LIMIT 5
```
