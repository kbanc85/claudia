# Inbox Triage

Categorize and prioritize emails to surface what needs attention. Uses the `tasks/inbox-triage.md` blueprint.

## Requirements

This command works best with Gmail MCP or equivalent email integration.

Without email integration:
- Ask user to paste or describe recent emails
- Work with whatever information is provided

## Process

### 1. Gather Emails
If email tool available:
- Pull unread emails (or specify timeframe)
- Default to last 24-48 hours

### 2. Check Sender Context
For each email:
- Check `people/` for relationship context
- Note if sender is VIP, key relationship, or unknown
- Consider sender in prioritization

### 3. Categorize
Sort into:

**🔴 Action Required Now**
- Needs response or action today
- Deadline mentioned
- Urgent language
- From key relationships

**🟡 Action Required Soon**
- Needs attention this week
- Not time-sensitive today
- Can be batched

**💬 To Respond**
- Needs a reply but not urgent
- Relationship maintenance
- Questions asked

**📋 FYI**
- Informational only
- No action needed
- Worth scanning

**📦 Archive**
- Newsletters
- Automated notifications
- Can be filed without action

### 4. Detect Commitments
Flag emails containing:
- "I'll send you..."
- "By [date]..."
- "Let me get back to you..."
- Any promise language

### 5. Surface Patterns
- Multiple emails from same sender
- Thread that's grown complex
- Topics recurring from past

## Output Format

```
## Inbox Triage — [Date/Time]

### 🔴 Action Required Now ([count])
1. **[Sender]**: [Subject]
   - [One-line summary]
   - Suggested action: [what to do]

### 🟡 Action Required Soon ([count])
[Same format]

### 💬 To Respond ([count])
[Same format]

### 📋 FYI ([count])
- [Sender]: [Subject] — [one-line]

### 📦 Archive ([count])
- [List of what can be archived]

### Commitment Detected
- In your reply to [X]: "I'll [commitment]" — Track this?
```

## Judgment Points

Before taking actions, ask:
- "Archive these FYI emails?"
- "Add this commitment to tracking?"
- "Draft a response to [priority email]?"

## Without Email Integration

Say:
"I don't have access to your email. If you'd like to add email integration, I can help you set up a Gmail MCP server. For now, feel free to paste any emails you'd like me to help triage."

Point to `docs/integrations.md` for setup instructions.
