# Task: Inbox Triage

---

## Trigger

- `/inbox-triage`
- "Check my email"
- "What needs my attention?"
- "Help me process my inbox"
- "What's urgent in my email?"

---

## Input

- **Type**: Email messages
- **Format**: Via Gmail MCP or similar email tool
- **Source**: Email inbox (unread or recent)

---

## Context

- [x] **Person-specific** — Reference `people/` for sender context
- [x] **Cross-cutting** — May surface new commitments for `context/commitments.md`

---

## Transformation

### 1. Extract
- **Sender** and relationship context
- **Subject/topic** summary
- **Action required** vs. FYI only
- **Urgency signals** (deadlines mentioned, escalation language)
- **Commitment mentions** ("I'll send..." or "by Friday...")

### 2. Organize
Categorize into:
- **Action Required Now** — Needs response or action today
- **Action Required Soon** — This week, but not urgent
- **To Respond** — Needs a reply but not time-sensitive
- **FYI** — Informational only, no action needed
- **Archive** — Can be filed without action

### 3. Connect
- Check sender against `people/` for context and history
- Flag if sender is a key relationship (recent project, VIP, etc.)
- Detect commitment language for potential tracking

### 4. Synthesize
- "X emails need attention today"
- Priority-ranked list with one-line summaries
- Note any patterns (e.g., "3 emails from the same project")

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Priority level | Now / Soon / Later / Archive | Suggest based on sender + content + deadline mentions |
| Needs response? | Yes / No / Delegate | Suggest based on content analysis |
| Creates commitment? | Yes / No | Flag if "I'll" or deadline language detected |
| Sender importance | VIP / Regular / Unknown | Check `people/` for existing relationship |

---

## What Good Looks Like

- [ ] Nothing urgent is missed
- [ ] Categories are clear and actionable
- [ ] Each item has a recommended action
- [ ] Sender context is surfaced when relevant
- [ ] Commitment language is flagged for potential tracking
- [ ] Unknown senders are noted

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Marking as low priority | Might be wrong | "Mark [email from X] as 'later'?" |
| Drafting responses | External communication | Show draft, ask "Should I send this?" |
| Adding commitments | User must own promises | "You said '[X]' in your reply. Add to commitments?" |
| Archiving | Irreversible in some systems | "Archive these X FYI emails?" |

---

## Notes

- Requires Gmail MCP or equivalent email integration
- If no email tool available, explain how to add it and work with pasted content
- Don't auto-archive anything—always confirm
- Watch for emails that reference ongoing projects or relationships
- Newsletter/promotional emails can usually be quickly categorized as Archive
