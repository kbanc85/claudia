# Founder/Entrepreneur Archetype

**Profile:** Startup founders and entrepreneurs building companies, raising capital, and leading teams.

**Key Signals:**
- Mentions investors, fundraising, or raising capital
- Talks about building team or hiring
- References product development or roadmap
- Uses terms like "runway," "burn rate," "traction"

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
├── investors/
│   └── [investor-name]/            ← Deep per-investor structure
│       ├── overview.md             ← Relationship status, investment details
│       ├── updates/                ← Investor update drafts sent to them
│       └── meetings/               ← Meeting notes
├── team/
│   └── [name]/
│       ├── overview.md
│       └── 1on1s/
├── product/
│   ├── roadmap.md                  ← Product roadmap
│   ├── decision-log.md             ← Product decisions
│   └── metrics.md                  ← Key metrics tracking
├── fundraising/
│   ├── overview.md                 ← Current round status
│   └── materials/                  ← Pitch deck, data room docs
├── pipeline/
│   ├── active.md                   ← Current investor conversations
│   ├── prospecting.md              ← Target investors
│   └── completed.md                ← Historical rounds
├── accountability/
│   ├── commitments.md              ← Founder commitments
│   └── overdue.md                  ← Escalation visibility
├── finances/
│   ├── overview.md                 ← Cash position, runway
│   ├── burn-tracking.md            ← Monthly burn analysis
│   └── projections.md              ← Financial projections
├── templates/
│   ├── investor-update.md          ← Monthly update template
│   ├── meeting-prep.md
│   ├── meeting-capture.md
│   └── weekly-review.md
└── insights/
    └── patterns.md                 ← Business patterns
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
├── investors/
│   ├── relationships/
│   ├── updates/
│   └── materials/
├── team/
│   └── _template/
│       └── overview.md
├── product/
│   ├── roadmap.md
│   └── decisions/
├── fundraising/
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
├── investors/
│   ├── relationships/
│   └── updates/
├── team/
│   └── _template/
│       └── overview.md
├── product/
│   └── roadmap.md
└── fundraising/
    └── overview.md
```

---

## Archetype-Specific Commands

### /investor-update

```markdown
# Investor Update

Draft a monthly investor update.

## Discovery Questions

1. "What month/period is this covering?"
2. "Any specific wins to highlight?"
3. "Any challenges to be transparent about?"
4. "Any asks of investors this month?"

## Structure

```
# Investor Update: [Month Year]
## [Company Name]

### TL;DR
[3-4 bullet executive summary]

### Metrics

| Metric | This Month | Last Month | Change |
|--------|------------|------------|--------|
| [Key Metric 1] | | | |
| [Key Metric 2] | | | |
| [Key Metric 3] | | | |

### Highlights
- 🎉 [Win 1]
- 🎉 [Win 2]
- 🎉 [Win 3]

### Challenges
- ⚠️ [Challenge 1] — [What we're doing about it]
- ⚠️ [Challenge 2] — [What we're doing about it]

### Product
[Key product updates, releases, learnings]

### Team
[Hiring, departures, org changes]

### Runway
- Current: [X months]
- Burn: $X/month
- Next milestone before raise: [What]

### Asks
[Specific asks of investors: intros, advice, etc.]

### Looking Ahead
[Focus for next month]
```

## Notes
- Be honest about challenges
- Specific asks get better responses
- Keep it scannable
```

### /pitch-prep

```markdown
# Pitch Prep

Prepare for an investor meeting or pitch.

## Usage
`/pitch-prep [investor/firm name]`

## What to Gather

1. **Investor Context**
   - Check `investors/relationships/` for prior relationship
   - Research their portfolio and thesis
   - Recent investments in space

2. **Your Narrative**
   - Key metrics to highlight
   - Story to tell
   - Anticipated questions

3. **The Ask**
   - What you're raising
   - Use of funds
   - Timeline

## Output Format

```
## Pitch Prep: [Investor/Firm Name]
### [Date and Time]

**Meeting Type:** [First meeting / Follow-up / Partner meeting]
**With:** [Person names and roles]

### About Them
- **Focus:** [Their investment thesis]
- **Relevant Investments:** [Portfolio companies in your space]
- **Check Size:** [Typical investment size]

### Our Relationship
- **Prior contact:** [Any previous interaction]
- **Intro from:** [Who connected you]

### Key Points to Hit
1. [Point 1 — why it matters to them]
2. [Point 2]
3. [Point 3]

### Metrics to Share
- [Metric]: [Value] ([context])
- [Metric]: [Value]

### Anticipated Questions
- [Question] — [Your answer]
- [Question] — [Your answer]

### The Ask
- Raising: $X
- Use of funds: [Brief]
- Timeline: [When you need to close]

### Questions for Them
- [Question about their portfolio]
- [Question about their process]

### Next Steps to Propose
[What you want to happen after this meeting]
```
```

### /team-standup

```markdown
# Team Standup

Prepare notes for team standup or all-hands.

## What to Include

1. **Company Updates**
   - Key wins from the week
   - Important announcements
   - Metrics highlights

2. **Team Focus**
   - Priorities for the week
   - Cross-team dependencies
   - Blockers to address

3. **Culture Moments**
   - Shoutouts and recognition
   - Upcoming events
   - Team health

## Output Format

```
## Team Standup — [Date]

### 🎉 Wins
- [Win — who made it happen]
- [Win]

### 📊 Metrics Check
- [Key metric]: [Value]
- [Key metric]: [Value]

### 🎯 This Week's Focus
- [Priority 1]
- [Priority 2]
- [Priority 3]

### 🔗 Dependencies
- [Team A] needs [X] from [Team B]

### 🚧 Blockers
- [Blocker] — [Who's addressing]

### 👏 Shoutouts
- [Person] — [What they did]
- [Person] — [What they did]

### 📅 Upcoming
- [Event or milestone]
```

## Tone
- Energizing but honest
- Celebrate wins
- Clear on priorities
```

### /runway-check

```markdown
# Runway Check

Financial runway and burn rate summary.

## What to Calculate

1. **Current Position**
   - Cash on hand
   - Monthly burn rate
   - Runway in months

2. **Projections**
   - Next 3 months burn
   - Key upcoming expenses
   - Revenue trajectory

3. **Milestones**
   - What needs to happen before next raise
   - Timeline to those milestones

## Output Format

```
## Runway Check — [Date]

### Current Position
- **Cash:** $X
- **Monthly Burn:** $X
- **Runway:** X months (until [Date])

### Burn Breakdown
| Category | Monthly | Notes |
|----------|---------|-------|
| Payroll | $X | |
| Infrastructure | $X | |
| Marketing | $X | |
| Other | $X | |

### Upcoming Changes
- [+/- $X] — [Reason] — [When]

### Path to Next Raise
- Need to hit: [Milestone]
- Current trajectory: [On track / Behind / Ahead]
- Time needed: X months
- Buffer: X months

### Recommendations
- [Suggestion if burn needs adjustment]
- [Suggestion for extending runway]

### Key Dates
- [Date]: [Milestone or decision point]
```

## Notes
- Update weekly or biweekly
- Be conservative on projections
- Flag concerns early
```

---

## Investor Templates (Full Business Depth)

### investors/[investor-name]/overview.md

```markdown
# [Investor Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Firm | [Fund name] |
| Role | [Partner / Principal / Associate] |
| Stage Focus | [Pre-seed / Seed / Series A / etc.] |
| Check Size | $X - $Y |
| Relationship Status | Prospecting / Warm / In Conversation / Committed / Passed / Existing Investor |
| Investment Amount | $X (if committed/invested) |

## About Them

**Investment Thesis:**
[What they invest in, what excites them]

**Sweet Spot:**
- Stage: [Preferred stage]
- Sectors: [Focus areas]
- Geography: [Where they invest]

**Relevant Portfolio:**
| Company | What They Do | Why Relevant |
|---------|--------------|--------------|
| | | |

**Known Preferences:**
- [What they like in founders/companies]
- [Red flags for them]

**Decision Process:**
- Timeline: [Typical decision timeframe]
- Partners involved: [Who else needs to approve]

## Our Relationship

**Intro Source:** [Who connected you, or how you met]
**First Contact:** [Date]
**Relationship Strength:** Cold / Warming / Warm / Strong

### Interaction History

| Date | Type | Key Topics | Outcome | Follow-up |
|------|------|------------|---------|-----------|
| | Meeting / Email / Event | | | |

## Their View of Us

**What they like:**
-

**Concerns/Questions:**
-

**Feedback received:**
[Specific feedback from conversations]

## Investment Status (if relevant)

| Field | Value |
|-------|-------|
| Amount Invested | $X |
| Instrument | SAFE / Convertible / Priced |
| Date | |
| Board seat? | Yes/No/Observer |

## Communication Preferences

- **Update frequency:** Monthly / Quarterly
- **Preferred format:** Email / Deck / Call
- **Best contact method:** [Email/Text/etc.]
- **Assistant/EA:** [Name and contact if relevant]

## Value-Add

**How they can help:**
- [Intro network]
- [Expertise areas]
- [Portfolio connections]

**Help requested:**
| Ask | Date | Outcome |
|-----|------|---------|
| | | |

## Next Steps

**Current status:** [Where things stand]
**Next action:** [What needs to happen]
**Timeline:** [When]
**Owner:** [You or them]

## Notes

[Personal details, conversation style, things to remember]

---

*Created: [Date]*
*Last updated: [Date]*
```

---

## Investor Template (Starter/Minimal)

`investors/relationships/_template.md`:

```markdown
# [Investor Name]

## Quick Stats

| Field | Value |
|-------|-------|
| Firm | [Fund name] |
| Role | [Partner / Principal / etc.] |
| Stage | [Seed / Series A / etc.] |
| Check Size | $X - $Y |
| Status | Prospecting / In conversation / Committed / Passed |

## About Them

**Thesis:** [What they invest in]

**Relevant Portfolio:**
- [Company 1]
- [Company 2]

**Known Preferences:**
- [What they like]
- [What they avoid]

## Our Relationship

**Intro Source:** [Who connected you]
**First Contact:** [Date]

### Interaction History

| Date | Type | Notes |
|------|------|-------|
| | Meeting / Email / Event | |

## Their Feedback

[What they've said about your company, concerns raised]

## Status

**Current:** [Where things stand]
**Next Step:** [What's next]
**Timeline:** [When to follow up]

## Notes

[Personal details, communication preferences]

---

*Last updated: [Date]*
```

---

## Product Templates (Full Business Depth)

### product/roadmap.md

```markdown
# Product Roadmap

## Vision
[Where the product is going - the end state]

## Current Focus
[What we're building now and why - the strategic bet]

## Key Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| | | | |

See `metrics.md` for detailed tracking.

## Roadmap

### Now (This Month)

| Feature/Project | Owner | Status | Target | Notes |
|-----------------|-------|--------|--------|-------|
| | | Not Started/In Progress/Testing/Done | [Date] | |

**Monthly Goal:**
[What success looks like this month]

### Next (Next Month)

| Feature/Project | Owner | Priority | Dependencies |
|-----------------|-------|----------|--------------|
| | | P0/P1/P2 | |

### Later (This Quarter)

| Feature/Project | Why | Rough Size |
|-----------------|-----|------------|
| | | S/M/L/XL |

### Backlog (Ideas)

| Idea | Source | Potential Impact |
|------|--------|------------------|
| | Customer/Internal/Market | High/Med/Low |

## Recently Shipped

| Feature | Date | Impact | Learnings |
|---------|------|--------|-----------|
| | | | |

## Key Decisions

See `decision-log.md` for detailed decision records.

| Date | Decision | Outcome |
|------|----------|---------|
| | | |

## Technical Debt

| Item | Impact | When to Address |
|------|--------|-----------------|
| | | |

---

*Last updated: [Date]*
```

### product/decision-log.md

```markdown
# Product Decision Log

## Recent Decisions

### [Date]: [Decision Title]

**Decision:** [What was decided]

**Context:** [Why this decision was needed]

**Options Considered:**
1. [Option A] - [Pros/Cons]
2. [Option B] - [Pros/Cons]

**Decided By:** [Who made the call]

**Rationale:** [Why this option]

**Impact:** [What changed as a result]

**Revisit Date:** [If applicable]

---

### [Date]: [Decision Title]
[Same structure]

---

## Decision Summary

| Date | Decision | Made By | Impact |
|------|----------|---------|--------|
| | | | Positive/Neutral/Revisit |

## Decisions We Might Revisit

| Decision | Original Date | Trigger to Revisit |
|----------|---------------|-------------------|
| | | [When we should reconsider] |

---

*Last updated: [Date]*
```

### product/metrics.md

```markdown
# Product Metrics

## Key Metrics Dashboard

### North Star
**[Primary Metric]:** [Current Value]
- Target: [Target]
- Trend: ↑/→/↓
- Last updated: [Date]

### Health Metrics

| Metric | Current | Last Week | Last Month | Target | Status |
|--------|---------|-----------|------------|--------|--------|
| | | | | | 🟢/🟡/🔴 |

## Growth Metrics

| Metric | Value | WoW Change | MoM Change |
|--------|-------|------------|------------|
| Users | | | |
| Signups | | | |
| Activation | | | |
| Retention | | | |

## Engagement Metrics

| Metric | Value | Trend | Notes |
|--------|-------|-------|-------|
| DAU | | | |
| WAU | | | |
| MAU | | | |
| DAU/MAU | | | |

## Revenue Metrics (if applicable)

| Metric | Value | MoM Change |
|--------|-------|------------|
| MRR | $X | |
| ARR | $X | |
| ARPU | $X | |
| Churn | X% | |

## Cohort Analysis

| Cohort | Week 1 | Week 2 | Week 4 | Week 8 |
|--------|--------|--------|--------|--------|
| [Month] | X% | X% | X% | X% |

## What We're Learning

**Working:**
-

**Not Working:**
-

**Experiments Running:**
| Experiment | Hypothesis | Status | Results |
|------------|------------|--------|---------|
| | | | |

---

*Last updated: [Date]*
```

---

## Product Template (Starter/Minimal)

`product/roadmap.md`:

```markdown
# Product Roadmap

## Vision
[Where the product is going]

## Current Focus
[What we're building now and why]

## Roadmap

### Now (This Month)
- [ ] [Feature/Project] — [Owner]
- [ ] [Feature/Project] — [Owner]

### Next (Next Month)
- [ ] [Feature/Project]
- [ ] [Feature/Project]

### Later (This Quarter)
- [ ] [Feature/Project]
- [ ] [Feature/Project]

### Backlog
- [Feature idea]
- [Feature idea]

## Recently Shipped

| Feature | Date | Impact |
|---------|------|--------|
| | | |

## Key Decisions

See `decisions/` folder for detailed decision records.

---

*Last updated: [Date]*
```

---

## Fundraising Template

`fundraising/overview.md`:

```markdown
# Fundraising Status

## Current Round

| Field | Value |
|-------|-------|
| Target | $X |
| Terms | [SAFE / Priced / etc.] |
| Status | Not started / Active / Closing |
| Target Close | [Date] |

## Progress

- **Committed:** $X (X% of target)
- **In Process:** $X
- **Pipeline:** $X

## Investor Pipeline

| Investor | Status | Check | Next Step |
|----------|--------|-------|-----------|
| | | | |

### Stages
1. Prospecting
2. Intro Sent
3. First Meeting
4. Follow-up
5. Partner Meeting
6. Due Diligence
7. Term Sheet
8. Committed

## Materials

- [ ] Deck
- [ ] Data Room
- [ ] Financial Model
- [ ] References

## Key Dates

- [Date]: [Milestone]

## Notes

[Strategy, learnings, adjustments]

---

*Last updated: [Date]*
```
