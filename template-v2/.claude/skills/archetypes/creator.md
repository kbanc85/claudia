# Content Creator Archetype

**Profile:** Creators who build audiences through content, manage collaborations, and monetize their platform.

**Key Signals:**
- Mentions audience, followers, or subscribers
- Talks about content creation or publishing
- References platforms (YouTube, LinkedIn, TikTok, Substack, etc.)
- Uses terms like "engagement," "reach," "collaborations"

---

## Folder Structure

Structure adapts based on `business_depth` setting from onboarding.

### Full Business Depth

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   │   ├── morning-brief.md
│   │   ├── meeting-prep.md
│   │   ├── capture-meeting.md
│   │   ├── what-am-i-missing.md
│   │   ├── weekly-review.md
│   │   ├── new-person.md
│   │   ├── follow-up-draft.md
│   │   ├── draft-reply.md
│   │   ├── summarize-doc.md
│   │   ├── pipeline-review.md      ← Business command
│   │   ├── financial-snapshot.md   ← Business command
│   │   └── accountability-check.md ← Business command
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
│   ├── me.md
│   ├── commitments.md
│   ├── waiting.md
│   ├── patterns.md
│   └── learnings.md
├── people/
│   └── _template.md
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

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/                   ← Base + archetype commands
│   │   └── pipeline-review.md      ← Only business command
│   ├── skills/
│   ├── hooks/
│   └── rules/
├── context/
├── people/
├── content/
│   ├── calendar.md
│   ├── ideas/
│   ├── drafts/
│   └── published/
├── audience/
│   ├── insights.md
│   └── feedback/
├── collaborations/
│   └── _template/
│       └── overview.md
├── revenue/
│   └── overview.md
├── pipeline/
│   └── active.md
├── finances/
│   └── overview.md
└── templates/
    └── meeting-capture.md
```

### Minimal Business Depth

```
claudia/
├── CLAUDE.md
├── .claude/
│   ├── commands/                   ← Base + archetype commands only
├── context/
├── people/
├── content/
│   ├── calendar.md
│   ├── ideas/
│   ├── drafts/
│   └── published/
├── audience/
│   ├── insights.md
│   └── feedback/
└── collaborations/
    └── _template/
        └── overview.md
```

---

## Archetype-Specific Commands

### /content-calendar

```markdown
# Content Calendar

View and manage content calendar.

## What to Show

From `content/calendar.md`:

### Upcoming (Next 2 Weeks)

| Date | Platform | Type | Topic | Status |
|------|----------|------|-------|--------|
| | | | | Idea / Drafted / Ready / Scheduled |

### This Week's Focus
- [Content piece with deadline]
- [Content piece with deadline]

### Content Pipeline

**Ideas:** [X] in `content/ideas/`
**Drafts:** [X] in `content/drafts/`
**Ready to publish:** [X]

### Gaps
- [Day with nothing planned]
- [Platform that's been neglected]

## Actions

- Add new content idea
- Move item between stages
- Suggest topics based on patterns

## Output Format

```
## Content Calendar — [Date]

### Publishing This Week

| Day | Platform | Content | Status |
|-----|----------|---------|--------|
| Mon | LinkedIn | [Topic] | 🟢 Ready |
| Wed | YouTube | [Topic] | 🟡 Drafting |
| Fri | Newsletter | [Topic] | 🔴 Need to start |

### Coming Up
- [Date]: [Platform] — [Topic]

### Ideas Queue (Top 5)
1. [Idea]
2. [Idea]
3. [Idea]

### Suggestions
- [Platform] hasn't had content in X days
- [Topic] performed well — consider a follow-up
```
```

### /draft-post

```markdown
# Draft Post

Quick social media post draft.

## Usage
`/draft-post [platform] [topic]`

## Platform Guidelines

### LinkedIn
- Professional but personable
- Hook in first line
- Line breaks for readability
- 1-3 hashtags max
- CTA at end
- Length: 150-300 words

### Twitter/X
- Punchy and direct
- Thread for longer content
- 1-2 hashtags
- Length: Under 280 chars (or thread)

### Instagram
- Visual context assumed
- Conversational tone
- Hashtags in first comment
- Length: 150-2200 chars

### Newsletter
- Personal and valuable
- Clear subject line
- One main idea
- Length: 500-1500 words

## Output Format

```
## Draft: [Platform] Post
### Topic: [Topic]

---

[The drafted content]

---

**Notes:**
- [Suggestion for visual]
- [Best time to post]
- [Related idea for follow-up]

**Hashtags:** [If applicable]

---

Ready to post? Let me know if you want adjustments.
```
```

### /audience-insights

```markdown
# Audience Insights

Review patterns in audience engagement and feedback.

## What to Analyze

From `audience/insights.md` and `audience/feedback/`:

### Content Performance
- What topics resonate
- What formats work
- Best times/days

### Audience Patterns
- Who engages most
- Common questions
- Pain points mentioned

### Growth Signals
- New follower trends
- Engagement trends
- Conversion patterns

## Output Format

```
## Audience Insights — [Date]

### What's Working

**Top Performing Content:**
| Content | Platform | Engagement | Why It Worked |
|---------|----------|------------|---------------|
| | | | |

**Themes That Resonate:**
- [Theme 1]
- [Theme 2]

### What to Double Down On
- [Recommendation based on data]

### Audience Questions
[Common questions from comments/DMs]
- [Question] — appears X times

### Growth Notes
- Follower trend: [Up/Down/Flat]
- Engagement trend: [Up/Down/Flat]
- Observations: [Pattern noticed]

### Suggestions
- [Content idea based on audience interest]
- [Format to try based on performance]
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
- **Platform/Presence:** [Where they create]
- **Audience:** [Size and type]
- **Content Style:** [What they do]

### The Pitch

**Subject:** [Email subject line option 1]
**Alt Subject:** [Email subject line option 2]

---

Hey [Name],

[Opening that shows you know their work]

[The collaboration idea — specific and valuable to them]

[What you bring to the table]

[Clear, low-friction ask]

[Warm close]

[Your name]

---

### Follow-up Plan
- If no response in [X days]: [Follow-up approach]
- If interested: [Next steps ready]

### Notes
- [Best way to reach them]
- [Mutual connections if any]
- [Timing considerations]
```

## Guidelines
- Lead with value to them
- Be specific about the idea
- Make it easy to say yes
- Short is better
```

---

## Content Templates

`content/calendar.md`:

```markdown
# Content Calendar

## Publishing Schedule

| Day | Platform | Type | Cadence |
|-----|----------|------|---------|
| Mon | LinkedIn | Post | Weekly |
| Wed | Newsletter | Email | Weekly |
| Fri | YouTube | Video | Weekly |

## This Month: [Month Year]

### Week 1: [Dates]
| Date | Platform | Topic | Status |
|------|----------|-------|--------|
| | | | |

### Week 2: [Dates]
| Date | Platform | Topic | Status |
|------|----------|-------|--------|
| | | | |

[Repeat for all weeks]

## Themes This Month
- [Theme 1]
- [Theme 2]

## Content Pipeline

**Ideas:** See `ideas/`
**Drafts:** See `drafts/`

## Performance Tracking

| Content | Platform | Date | Engagement | Notes |
|---------|----------|------|------------|-------|
| | | | | |

---

*Last updated: [Date]*
```

`content/ideas/_template.md`:

```markdown
# Content Idea: [Title]

**Platform(s):** [Where this would go]
**Type:** [Post / Video / Thread / Article]
**Priority:** High / Medium / Low

## The Idea

[Core concept]

## Hook

[Opening line or angle]

## Key Points

1. [Point 1]
2. [Point 2]
3. [Point 3]

## Call to Action

[What you want audience to do]

## Notes

- [Research needed]
- [Visual ideas]
- [Related content to link]

---

*Added: [Date]*
```

---

## Audience Template

`audience/insights.md`:

```markdown
# Audience Insights

## Overview

**Primary Platforms:**
- [Platform 1]: [Follower count]
- [Platform 2]: [Follower count]

**Total Reach:** [Combined audience]

## Demographics

| Attribute | Detail |
|-----------|--------|
| Primary Age | |
| Location | |
| Profession | |
| Interests | |

## What They Care About

1. [Pain point / interest 1]
2. [Pain point / interest 2]
3. [Pain point / interest 3]

## Top Performing Content

| Content | Platform | Engagement | Date |
|---------|----------|------------|------|
| | | | |

## Common Questions

[Questions that come up repeatedly]

## Content Preferences

**Formats they engage with:**
- [Format 1]
- [Format 2]

**Topics that resonate:**
- [Topic 1]
- [Topic 2]

**Posting times that work:**
- [Time / Day]

## Feedback Themes

[Patterns from comments, DMs, emails]

---

*Last updated: [Date]*
```

---

## Partnership Templates (Full Business Depth)

### partnerships/[brand-name]/overview.md

```markdown
# [Brand Name] Partnership

## Deal Summary

| Field | Value |
|-------|-------|
| Status | Prospecting / Negotiating / Active / Completed |
| Deal Type | Sponsored Post / Campaign / Ambassador / Affiliate |
| Total Value | $X |
| Start Date | |
| End Date | |
| Primary Contact | |

## Deal Terms

**Compensation:**
- Base fee: $X
- Performance bonus: [If applicable]
- Payment terms: [Net 30, etc.]

**Deliverables:**

| Deliverable | Platform | Due | Status | Notes |
|-------------|----------|-----|--------|-------|
| | | | Draft / Review / Approved / Published | |

**Usage Rights:**
- Duration: [How long they can use content]
- Platforms: [Where they can use it]
- Exclusivity: [Any exclusivity clauses]

## Content Requirements

**Brand Guidelines:**
- Must include: [Required elements]
- Cannot include: [Restrictions]
- Hashtags: [Required tags]
- Disclosure: [FTC requirements]

**Approval Process:**
1. [Step 1]
2. [Step 2]
3. [Timeline for approvals]

## Campaign Goals

**Their Goals:**
- [What success looks like for them]

**Metrics Tracking:**
| Metric | Target | Actual |
|--------|--------|--------|
| | | |

## Relationship

**Contact:**
| Role | Name | Email |
|------|------|-------|
| Brand Contact | | |
| Agency (if any) | | |

**Communication History:**
| Date | Topic | Outcome |
|------|-------|---------|
| | | |

## Financial

- **Invoice Status:** [Not sent / Sent / Paid]
- **Amount Invoiced:** $X
- **Amount Received:** $X
- **Outstanding:** $X

## Content Drafts

See `content/` folder for:
- Draft versions
- Feedback received
- Approved final versions

## Notes

[Important details, preferences, lessons learned]

---

*Created: [Date]*
*Last updated: [Date]*
```

---

## Revenue Templates (Full Business Depth)

### revenue/overview.md

```markdown
# Revenue Overview

## This Month: [Month Year]

| Revenue Stream | Amount | vs Last Month | Notes |
|----------------|--------|---------------|-------|
| Sponsorships | $X | +/-X% | |
| Products | $X | +/-X% | |
| Affiliate | $X | +/-X% | |
| Other | $X | +/-X% | |
| **Total** | **$X** | **+/-X%** | |

## Revenue by Stream

### Sponsorships
See `sponsorships.md` for details.
- Active deals: X
- Pipeline value: $X
- Average deal size: $X

### Products
See `products.md` for details.
- Active products: X
- Monthly recurring: $X
- One-time sales: $X

### Affiliate
See `affiliate.md` for details.
- Active programs: X
- Monthly average: $X

## Year to Date

| Month | Sponsorships | Products | Affiliate | Total |
|-------|--------------|----------|-----------|-------|
| Jan | $X | $X | $X | $X |
| Feb | $X | $X | $X | $X |
...

**YTD Total:** $X

## Trends

**What's Growing:**
-

**What's Declining:**
-

**Seasonal Patterns:**
-

## Goals

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Monthly Revenue | $X | $X | |
| Sponsorship Rate | $X | $X | |
| Product Revenue | $X | $X | |

---

*Last updated: [Date]*
```

### revenue/sponsorships.md

```markdown
# Sponsorship Tracking

## Active Partnerships

| Brand | Deal Type | Value | Start | End | Status |
|-------|-----------|-------|-------|-----|--------|
| | | $X | | | Active / Pending Deliverable |

**Total Active Value:** $X

## Pipeline

| Brand | Stage | Est. Value | Next Step | Due |
|-------|-------|------------|-----------|-----|
| | Outreach / Negotiating / Contract | $X | | |

**Pipeline Value:** $X

## Completed This Year

| Brand | Type | Value | Delivered | Paid |
|-------|------|-------|-----------|------|
| | | $X | [Date] | Yes/No |

**YTD Sponsorship Revenue:** $X

## Rate Card

| Platform | Format | Rate | Notes |
|----------|--------|------|-------|
| YouTube | Integrated (60s) | $X | |
| YouTube | Dedicated | $X | |
| Instagram | Story (3 frames) | $X | |
| Instagram | Post | $X | |
| Newsletter | Dedicated | $X | |
| Podcast | Read (60s) | $X | |

## Brand Wishlist

Brands I'd love to work with:
- [Brand] - [Why, approach idea]

## Learnings

**What converts:**
-

**What to avoid:**
-

---

*Last updated: [Date]*
```

### revenue/products.md

```markdown
# Product Revenue

## Active Products

| Product | Type | Price | Monthly Revenue | Status |
|---------|------|-------|-----------------|--------|
| | Course / Digital / Membership / Template | $X | $X | Active / Paused |

## Sales This Month

| Product | Units | Revenue | Notes |
|---------|-------|---------|-------|
| | | $X | |

**Monthly Total:** $X

## Product Performance

| Product | Lifetime Revenue | Units Sold | Avg. Rating |
|---------|------------------|------------|-------------|
| | $X | | |

## Launch Calendar

| Product | Launch Date | Target Revenue | Status |
|---------|-------------|----------------|--------|
| | | $X | Planning / Building / Pre-launch / Live |

## Product Ideas

| Idea | Target Audience | Est. Price | Priority |
|------|-----------------|------------|----------|
| | | $X | High/Med/Low |

---

*Last updated: [Date]*
```

---

## Collaboration Template (All Business Depths)

`collaborations/_template/overview.md`:

```markdown
# [Person/Brand Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Platform | [Their primary platform] |
| Audience | [Size] |
| Status | Prospect / In Discussion / Active / Completed |
| Contact | [Email/handle] |

## About Them

**What they do:** [Their content focus]
**Why collab:** [Value of working together]
**Audience overlap:** [How audiences align]

## Collaboration Ideas

- [Idea 1]
- [Idea 2]

## Outreach History

| Date | Channel | Content | Response |
|------|---------|---------|----------|
| | | | |

## Current Status

[Where things stand]

## Next Steps

- [ ] [Action item]

## Notes

[Observations, mutual connections, timing]

---

*Created: [Date]*
*Last updated: [Date]*
```
