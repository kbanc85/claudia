# Task: Draft Follow-Up

---

## Trigger

- `/follow-up-draft [person]`
- "Write a follow-up to [person]"
- "Send a thank-you to [person] from the meeting"
- "Draft a post-meeting summary for [person]"
- "Follow up on my conversation with [person]"

---

## Input

- **Type**: Meeting context or conversation details
- **Format**: Meeting notes, transcript summary, or verbal summary
- **Source**: Recent meeting or conversation (often same session as `/capture-meeting`)

---

## Context

- [x] **Person-specific** — Reference `people/[person].md` for relationship context
- [x] **Cross-cutting** — Reference `context/commitments.md` for what was promised

---

## Transformation

### 1. Extract
- **Key takeaways** from the meeting
- **Next steps** agreed upon
- **Commitments made** by both parties
- **Relationship tone** (warm, formal, energized, etc.)
- **Open questions** that need follow-up

### 2. Organize
Structure the follow-up:
1. **Opening** — Thank them, reference something specific from the call
2. **Summary** — Brief recap of key points (3-5 bullets max)
3. **Next steps** — What you'll do, what they'll do
4. **Close** — Forward-looking, warm sign-off

### 3. Connect
- Check `people/[person].md` for communication style preferences
- Reference commitments from `context/commitments.md`
- Note any time-sensitive items

### 4. Synthesize
- Complete email draft
- Clear subject line (not "Following up" or "Great meeting")
- Appropriate tone for the relationship

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Formality | Formal / Professional / Casual | Match previous communication with this person |
| Detail level | Brief / Standard / Comprehensive | Standard (cover key points, not exhaustive) |
| Include summary? | Yes / No | Yes for first meetings, skip for ongoing relationships |
| Attachments | Include / Skip | Ask if materials were promised |

---

## What Good Looks Like

- [ ] Sent within 24 hours of meeting (sooner is better)
- [ ] Opens with genuine appreciation (not generic)
- [ ] References something specific from the conversation
- [ ] Clearly states next steps with owners
- [ ] Matches the energy of the meeting
- [ ] Under 200 words (unless comprehensive summary requested)
- [ ] Subject line is specific ("Re: AI Implementation Discussion" not "Following up")

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Email draft | External communication | "Here's the follow-up draft. Ready to send?" |
| Tone check | Subjective | "The meeting felt [X]. Does this tone match?" |
| Commitments listed | Accuracy | "I'm listing these next steps. All correct?" |
| Adding attachments | Promising deliverables | "Attach [X] as discussed?" |

---

## Notes

- Never send without explicit approval
- Speed matters—same-day follow-ups make better impressions
- The specific reference to something from the call shows you were listening
- For important relationships, err on the side of warmer/more personal
- If you promised to send something, remind user to prepare it
- Good follow-ups reinforce what was agreed, not just recap what was said
