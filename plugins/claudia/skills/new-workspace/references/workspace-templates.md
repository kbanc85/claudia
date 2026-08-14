# Workspace Templates by Archetype

Reference guide for the new-workspace skill. Shows archetype-specific directory structures and template variations.

---

## Consultant / Advisor

```
workspaces/{{slug}}/
├── Dashboard.md              ← Phase tracker, deliverables, billing summary
├── Timeline.md               ← Chronological engagement history
├── Pipeline.md               ← Opportunity tracking (if prospecting)
├── meetings/                 ← Meeting captures and prep notes
├── deliverables/             ← Proposals, reports, presentations
├── agreements/               ← SOWs, contracts, amendments
├── invoices/                 ← Invoice tracking and payment status
└── research/                 ← Background research, competitive analysis
```

**Dashboard sections:**
- Engagement Status (phase, health indicator)
- Key Contact (linked to person file)
- Active Deliverables (checklist with deadlines)
- Billing Summary (total billed, outstanding, next invoice date)
- Quick Links (to key files)

**Typical commands:** `/capture-meeting`, `/follow-up-draft`, `/client-health`

---

## Executive / Manager

```
workspaces/{{slug}}/
├── Dashboard.md              ← Initiative status, team metrics
├── Timeline.md               ← Key decisions and milestones
├── meetings/                 ← 1:1s, team meetings, board prep
├── deliverables/             ← Reports, decks, plans
├── decisions/                ← Decision log with rationale
└── team/                     ← Team notes, org changes
```

**Dashboard sections:**
- Initiative Status (traffic light indicators)
- Team Health (engagement signals, capacity)
- Upcoming Decisions (with deadlines)
- Stakeholder Updates (who needs to know what)

**Typical commands:** `/morning-brief`, `/meeting-prep`, `/weekly-review`

---

## Founder / Entrepreneur

```
workspaces/{{slug}}/
├── Dashboard.md              ← Product status, runway, team
├── Timeline.md               ← Milestones and pivot points
├── Pipeline.md               ← Investor pipeline or sales pipeline
├── meetings/                 ← Investor calls, partner meetings
├── deliverables/             ← Pitch decks, product specs
├── agreements/               ← Term sheets, partnerships
└── metrics/                  ← KPIs, growth data
```

**Dashboard sections:**
- Product Status (build phase, key milestones)
- Fundraising (if applicable: target, committed, pipeline)
- Team (headcount, open roles, key hires)
- Key Metrics (whatever drives the business)

**Typical commands:** `/pipeline-review`, `/meeting-prep`, `/research`

---

## Solo Professional

```
workspaces/{{slug}}/
├── Dashboard.md              ← Project status, client contact
├── Timeline.md               ← Work log and milestones
├── meetings/                 ← Client calls, check-ins
├── deliverables/             ← Work product
├── agreements/               ← Contracts, terms
└── invoices/                 ← Billing
```

**Dashboard sections:**
- Project Status (current phase, next milestone)
- Client Contact (linked person file)
- Deliverables (checklist)
- Billing (simple total + payment status)

**Typical commands:** `/capture-meeting`, `/draft-reply`, `/follow-up-draft`

---

## Content Creator

```
workspaces/{{slug}}/
├── Dashboard.md              ← Content calendar, audience metrics
├── Timeline.md               ← Publication history
├── content/                  ← Drafts, published pieces
├── collaborations/           ← Partner/sponsor details
├── research/                 ← Topic research, source material
└── analytics/                ← Performance data
```

**Dashboard sections:**
- Content Calendar (upcoming publications)
- Active Collaborations (partners, sponsors)
- Audience Metrics (growth, engagement)
- Content Pipeline (ideas, drafts, in review, published)

**Typical commands:** `/research`, `/draft-reply`, `/weekly-review`

---

## Template Variables

All templates support these variables:

| Variable | Source | Example |
|---|---|---|
| `{{project}}` | Workspace name | "Acme Corp Redesign" |
| `{{project-slug}}` | URL-safe slug | "acme-corp-redesign" |
| `{{client}}` | Main contact name | "Sarah Chen" |
| `{{sponsor}}` | Budget/decision owner | "Jim Ferry" |
| `{{filesystem_root}}` | Full workspace path | "workspaces/acme-corp-redesign" |
| `{{date}}` | Current date | "2026-03-04" |
| `{{phase}}` | Starting phase | "Discovery" |

---

## Choosing Which Templates to Include

Not every workspace needs every template. Use this guide:

| Template | Include When |
|---|---|
| Dashboard.md | Always |
| Timeline.md | Always |
| Pipeline.md | Sales/fundraising context, or multiple opportunities |
| meetings/ | Client-facing or collaborative work |
| deliverables/ | There are concrete outputs to track |
| agreements/ | Contractual relationship exists |
| invoices/ | Billing is involved |
| research/ | Exploratory or analytical work |
| decisions/ | Multiple stakeholders, formal decision-making |
| team/ | Managing people on this project |

Ask the user which templates to include rather than creating everything by default.
