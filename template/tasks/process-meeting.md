# Task: Process Meeting Transcript

---

## Trigger

- "Here's a transcript from [client/person]"
- "Process these meeting notes"
- "Here are my notes from the call with [person]"
- `/capture-meeting`

---

## Input

- **Type**: Meeting transcript or notes
- **Format**: Text paste, file, or summary
- **Source**: Note-taking apps (Granola, Otter, etc.), manual notes, memory

---

## Context

- [x] **Person-specific** — Update `people/[attendee].md` with new context
- [x] **Project-specific** — If project mentioned, update `projects/[project]/`
- [x] **Cross-cutting** — Update `context/commitments.md`, `context/waiting.md`

---

## Transformation

### 1. Extract
- **Decisions made** — Who decided what, and when
- **Commitments created** — With owners and deadlines
- **Blockers surfaced** — What's in the way
- **Sentiment signals** — Enthusiasm, concern, resistance, energy
- **Next steps** — Agreed actions
- **Key topics discussed** — Main themes

### 2. Organize
- Save meeting notes to `people/[person]/meeting_notes/YYYY-MM-DD-[description].md` or `projects/[project]/meeting_notes/`
- Create summary separately if requested

### 3. Connect
- Link new commitments to `context/commitments.md`
- Link items waiting on others to `context/waiting.md`
- Update `people/[attendee].md` with relevant new context
- Note decisions in project files if applicable

### 4. Synthesize
- 300-500 word summary focusing on outcomes, not blow-by-blow
- Bulleted action items with owners and deadlines
- Sentiment assessment (1-2 sentences on how it went)

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Person/project attribution | Specific person / Project / General | Ask if ambiguous |
| Commitment owner | User / Other person | Default to user unless clearly someone else |
| Deadline interpretation | Specific date / "Soon" / "Later" | Ask if vague ("next week" → ask which day) |
| Sentiment flags | Flag concern / Don't flag | Flag if tension detected, ask for confirmation |

---

## What Good Looks Like

- [ ] Every action item has an owner
- [ ] Every commitment has a deadline (even if approximate)
- [ ] Sentiment signals are noted but not over-interpreted
- [ ] Summary is actionable, not just descriptive
- [ ] Related people files are updated with new context
- [ ] No unexplained jargon or unclear references

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Adding commitments | User must own promises | "Add to your commitments: '[item]' by [date]?" |
| Adding to waiting-on | Tracking expectations | "Track that [person] owes you [item] by [date]?" |
| Updating stakeholder sentiment | Subjective assessment | "I noticed [signal]. Update [person]'s file to note this?" |
| Flagging concerns | Interpretation required | "This seems like a potential issue. Add to blockers?" |
| File location | Might need clarification | "Save to [person] or [project] folder?" |

---

## Notes

- If attendees aren't clear, ask before processing
- For recurring meetings, reference previous notes to track patterns
- Watch for commitments made by the other party (add to waiting-on, not commitments)
- Sentiment is about the relationship/project health, not judging people
