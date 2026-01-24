# Task: Draft Outreach

---

## Trigger

- `/draft-outreach [prospect]`
- "Write a cold email to..."
- "Help me reach out to [company/person]"
- "Draft an intro email for..."
- "I want to connect with [person]"

---

## Input

- **Type**: Target person/company and context
- **Format**: Name, company, any known details, purpose of outreach
- **Source**: User instruction, research results, LinkedIn profile

---

## Context

- [x] **Person-specific** — Create or reference `people/[person].md`
- [x] **Cross-cutting** — Track in `context/outreach.md` if ongoing sequence

---

## Transformation

### 1. Extract
- **Who** — Name, role, company
- **Why** — What do you want from this connection?
- **Hook** — Why should they care? What's relevant to them?
- **Credibility** — Why should they take the meeting?
- **Ask** — What specifically are you requesting?

### 2. Organize
Structure the email:
1. **Subject line** — Specific, not salesy, mentions something relevant
2. **Opening** — Personal hook (not "Hope this finds you well")
3. **Value** — Why this is worth their time (2-3 sentences max)
4. **Credibility** — Brief proof you're worth talking to
5. **Ask** — Clear, low-friction request
6. **Sign-off** — Professional, not desperate

### 3. Connect
- Check `people/` for any existing relationship or context
- Reference any mutual connections if relevant
- Track outreach in `context/outreach.md` for follow-up sequences

### 4. Synthesize
- Complete email draft
- Subject line options (2-3)
- Follow-up sequence suggestions (when to follow up, what to say)

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Tone | Professional / Warm / Direct / Casual | Match industry norms |
| Length | Short (3-4 sentences) / Medium (5-7) / Longer | Default to short |
| Ask | Meeting / Call / Email reply / Introduction | Clarify with user |
| Personalization depth | Generic / Moderate / Deep research | Ask what's available |

---

## What Good Looks Like

- [ ] Subject line is specific and relevant (not "Quick question" or "Touching base")
- [ ] Opens with something about THEM, not you
- [ ] Value proposition is clear in 2-3 sentences
- [ ] Ask is specific and low-friction
- [ ] Under 150 words total
- [ ] No desperate energy or overselling
- [ ] Sounds like a human, not a template
- [ ] No "I hope this finds you well" or "Just following up"

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Email draft | External communication | "Here's the draft. Ready to send?" |
| Personalization accuracy | Might be wrong | "I found [X] about them. Accurate?" |
| Tone calibration | Subjective | "This is fairly [direct/casual]. Adjust?" |
| Adding to tracking | Commitment to follow up | "Track this in outreach.md for follow-up on [date]?" |

---

## Notes

- Never send without explicit approval
- Research first if web search is available (use `/research-prospect`)
- Shorter is almost always better for cold outreach
- The ask should be easy to say yes to (15-min call, not hour-long meeting)
- If follow-up needed, suggest 3-5-7 day intervals
- Track all outreach in `context/outreach.md` for systematic follow-up
