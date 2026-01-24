# Task: Research Prospect

---

## Trigger

- `/research-prospect [company/person]`
- "Research [company] for me"
- "What can you find out about [person]?"
- "Help me prepare for a call with [company]"
- "I'm targeting [company], what should I know?"

---

## Input

- **Type**: Company name or person name
- **Format**: Name, optional context about why you're researching
- **Source**: User instruction, preparation for outreach or meeting

---

## Context

- [x] **Person-specific** — Create or update `people/[person].md`
- [ ] **Project-specific** — If part of a deal or project

---

## Transformation

### 1. Extract
**For Companies:**
- **Overview** — What they do, size, industry
- **Recent news** — Last 6-12 months of notable events
- **Key people** — Leadership, decision makers in your area
- **Potential pain points** — Based on industry, news, job postings
- **Connection angles** — Mutual connections, shared interests, relevant experience
- **Competitors** — Who they compete with

**For People:**
- **Current role** — Title, company, tenure
- **Background** — Career history, education, notable achievements
- **Online presence** — LinkedIn, Twitter, articles, speaking
- **Interests/themes** — What they post about, care about
- **Connection angles** — Shared connections, experiences, interests

### 2. Organize
- Create structured profile with sections
- Highlight actionable insights (what to mention, what to avoid)
- Note potential conversation starters

### 3. Connect
- Create or update `people/[person].md` with findings
- Note company context if relevant to existing relationships
- Flag if anyone in `people/` has connections

### 4. Synthesize
- One-page profile with key facts
- "What to know" summary (3-5 bullet points)
- Suggested talking points or hooks
- Potential pain points to explore
- Recommended approach (warm intro, cold outreach, event-based)

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Research depth | Quick scan / Standard / Deep dive | Standard (5-10 min equivalent) |
| Focus area | Company / Person / Both | Infer from request |
| Create file? | Yes / No | Yes if this is a sales target |
| Connection search | Search for mutual connections | Do if LinkedIn/social available |

---

## What Good Looks Like

- [ ] Key facts are accurate and current
- [ ] Research is synthesized, not just listed
- [ ] Actionable hooks are identified (not just generic info)
- [ ] Pain points are inferred intelligently
- [ ] Connection opportunities are surfaced
- [ ] Nothing that would be embarrassing if they saw it
- [ ] Sources are noted for verification

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Creating person file | Adding to system | "Create a file for [person] in people/?" |
| Accuracy check | Research might be outdated | "I found [X]. Does this seem current?" |
| Sensitivity | Some info might be too personal | "I found [personal info]. Include or skip?" |
| Proceeding to outreach | Next step | "Ready to draft an outreach based on this?" |

---

## Notes

- Requires web search capability for best results
- Without web search, work with whatever the user can provide
- Focus on actionable insights, not comprehensive biography
- Watch for negative news that might affect approach
- Note job postings—they reveal pain points
- Recent LinkedIn activity reveals current priorities
- Always verify critical facts before using in outreach
