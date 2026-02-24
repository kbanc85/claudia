# Content Creator Archetype

**Profile:** Creators who build audiences through content, manage collaborations, and monetize their platform.

**Key Signals:** Audience, followers, subscribers, content creation, publishing, platforms (YouTube, LinkedIn, TikTok, Substack), "engagement," "reach," "collaborations"

Includes everything from `_base-structure.md`, plus the following archetype-specific structure.

---

## Folder Structure (Archetype-Specific Additions)

### Full Business Depth

Adds to base structure:

```
├── content/
│   ├── calendar.md
│   ├── ideas/
│   ├── drafts/
│   └── published/
├── audience/
│   ├── insights.md
│   └── feedback/
├── partnerships/
│   └── [brand-name]/               ← Per-partnership structure
│       ├── overview.md             ← Deal terms, deliverables, timeline
│       └── content/                ← Sponsored content drafts
├── collaborations/
│   └── [creator-name]/
│       └── overview.md
├── revenue/
│   ├── overview.md                 ← Income streams summary
│   ├── sponsorships.md             ← Brand deal tracking
│   ├── products.md                 ← Digital products/courses
│   └── affiliate.md                ← Affiliate income tracking
├── pipeline/
│   ├── active.md                   ← Current deals/partnerships
│   ├── prospecting.md              ← Potential sponsors
│   └── completed.md                ← Historical partnerships
├── accountability/
│   ├── commitments.md              ← Content deadlines, sponsor deliverables
│   └── overdue.md                  ← Missed deadlines visibility
├── finances/
│   ├── overview.md                 ← Revenue summary
│   ├── expenses.md                 ← Business expenses
│   ├── invoicing.md                ← Invoice tracking
│   └── tax-planning.md             ← Quarterly tax notes
├── templates/
│   ├── brand-pitch.md              ← Outreach template
│   ├── meeting-capture.md
│   ├── content-brief.md            ← Sponsored content planning
│   └── weekly-review.md
└── insights/
    └── patterns.md                 ← Content & business patterns
```

### Starter Business Depth

Base + `content/` (calendar, ideas, drafts, published), `audience/` (insights, feedback), `collaborations/_template/overview.md`, `revenue/overview.md`, `pipeline/active.md`, `finances/overview.md`.

### Minimal Business Depth

Base + `content/` (calendar, ideas, drafts, published), `audience/` (insights, feedback), `collaborations/_template/overview.md`.

---

## Archetype-Specific Commands

### /content-calendar

```markdown
# Content Calendar

View and manage content calendar.

## What to Show

From `content/calendar.md`:
- Upcoming 2 weeks (date/platform/type/topic/status)
- This week's focus
- Content pipeline counts (ideas/drafts/ready)
- Gaps (empty days, neglected platforms)

## Output Format

```
## Content Calendar — [Date]

### Publishing This Week
| Day | Platform | Content | Status |
|-----|----------|---------|--------|

### Coming Up / Ideas Queue (Top 5) / Suggestions
```
```

### /draft-post

```markdown
# Draft Post

Quick social media post draft.

## Usage
`/draft-post [platform] [topic]`

## Platform Guidelines

- **LinkedIn** — Professional but personable, hook first line, 1-3 hashtags, 150-300 words
- **Twitter/X** — Punchy, threads for longer, 1-2 hashtags, under 280 chars
- **Instagram** — Conversational, hashtags in first comment, 150-2200 chars
- **Newsletter** — Personal and valuable, clear subject, one main idea, 500-1500 words

## Output Format

```
## Draft: [Platform] Post — Topic: [Topic]

[The drafted content]

**Notes:** [Visual suggestion, best time to post, follow-up idea]
**Hashtags:** [If applicable]
```
```

### /audience-insights

```markdown
# Audience Insights

Review patterns in audience engagement and feedback.

## What to Analyze

1. **Content Performance** — Topics that resonate, formats that work, best times/days
2. **Audience Patterns** — Top engagers, common questions, pain points
3. **Growth Signals** — Follower trends, engagement trends, conversion patterns

## Output Format

```
## Audience Insights — [Date]

### What's Working
| Content | Platform | Engagement | Why It Worked |
|---------|----------|------------|---------------|

### Themes That Resonate / What to Double Down On
### Audience Questions / Growth Notes / Suggestions
```
```

### /collab-outreach

```markdown
# Collaboration Outreach

Draft outreach for potential collaboration.

## Usage
`/collab-outreach [person/brand name]`

## Discovery Questions

1. "What kind of collaboration are you proposing?"
2. "What value can you offer them?"
3. "What's your audience overlap?"

## Output Format

```
## Collab Outreach: [Name]

### About Them
- **Platform:** [Primary] | **Audience:** [Size] | **Style:** [What they do]

### The Pitch
**Subject:** [Option 1] / **Alt:** [Option 2]

[Opening showing you know their work]
[The collaboration idea]
[What you bring]
[Clear, low-friction ask]

### Follow-up Plan / Notes
```

## Guidelines
- Lead with value to them
- Be specific about the idea
- Make it easy to say yes
```

---

## Content Templates

`content/calendar.md`: Publishing schedule (day/platform/type/cadence), monthly calendar with weekly tables (date/platform/topic/status), themes, pipeline references, performance tracking table.

`content/ideas/_template.md`: Platform, type, priority, core concept, hook, key points, CTA, notes (research/visuals/related content).

---

## Audience Template

`audience/insights.md`: Overview (platforms with follower counts, total reach), demographics, what they care about, top performing content, common questions, content preferences (formats, topics, posting times), feedback themes.

---

## Partnership Templates

### Full Business Depth

`partnerships/[brand-name]/overview.md`: Deal summary (status, type, value, dates, contact), deal terms (compensation, payment terms), deliverables table (platform/due/status), usage rights (duration, platforms, exclusivity), content requirements (brand guidelines, must/cannot include, hashtags, FTC disclosure, approval process), campaign goals and metrics, relationship contacts and history, financial (invoice status, amounts), content drafts reference, notes.

---

## Revenue Templates (Full Business Depth)

| File | Purpose | Key Fields |
|------|---------|------------|
| `revenue/overview.md` | Income streams | Monthly revenue by stream (sponsorships/products/affiliate/other), year-to-date table, trends (growing/declining/seasonal), goals |
| `revenue/sponsorships.md` | Brand deals | Active partnerships table, pipeline, completed YTD, rate card (platform/format/rate), brand wishlist, learnings |
| `revenue/products.md` | Digital products | Active products (type/price/monthly revenue), monthly sales, lifetime performance, launch calendar, product ideas |

---

## Collaboration Template (All Business Depths)

`collaborations/_template/overview.md`: Quick stats (platform, audience, status, contact), about them (focus, why collab, audience overlap), collaboration ideas, outreach history, current status, next steps, notes.
