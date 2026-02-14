---
name: inbox-check
description: Lightweight inbox triage across all configured email accounts. Dispatches fast subagent to fetch, then reviews with judgment. Use when user says "check my inbox", "any new emails?", "check email".
effort-level: low
---

# Inbox Check

Two-tier inbox triage: fetch fast, then judge what matters.

## Trigger

- "Check my inbox"
- "Any new emails?"
- "Check email"
- "What's in my inbox?"
- `/inbox-check`

## Architecture

This skill uses a two-tier approach to save tokens and time:

1. **Tier 1 (Haiku subagent):** Fast fetch and summarize from all available email MCP tools
2. **Tier 2 (You):** Review results with judgment, context, and relationship awareness

## Process

### Step 1: Detect Available Email Tools

Check which email MCP tools are available:
- Gmail tools (`gmail.*` or similar)
- Outlook tools (`outlook.*` or similar)
- Any other email integrations

If no email tools available:
"I don't have access to any email accounts. Would you like to set up an email integration? Check `/connector-discovery` for options."

### Step 2: Dispatch Fetch Agent

Use the Task tool to dispatch a Haiku subagent:

```
Subagent prompt:
"Check all available email accounts for recent messages (last 24 hours or since last check).
For each email, extract:
- From (name and email)
- Subject
- Date/time
- Brief summary (1 sentence)
- Has attachments? (yes/no)
- Seems urgent? (yes/no, based on subject and sender)

Return as a structured list, grouped by account if multiple.
Do not read full email bodies unless the subject is unclear.
Limit to 20 most recent per account."
```

### Step 3: Review with Judgment

Once the fetch results come back, apply judgment using your knowledge of the user's relationships, priorities, and patterns:

**Categorize each email:**

| Category | Criteria |
|----------|----------|
| **Needs Reply** | From known contacts, asks a question, requires action |
| **Worth Reading** | Relevant to active projects, from important people |
| **Can Wait** | Newsletters, notifications, low-priority updates |
| **Skip** | Marketing, spam that got through, irrelevant notifications |

**Use relationship context:**
- If sender is in `people/`, note the relationship context
- If related to active projects, flag the connection
- If sender has pending commitments, note those

### Step 4: Present Results

```
**📬 Inbox Check**

### Needs Reply
- **[Name]** — [Subject] ([time ago])
  [1-line context: what they need, any relationship notes]

### Worth Reading
- **[Name]** — [Subject] ([time ago])
  [Why it matters]

### Can Wait
- [count] emails (newsletters, notifications, low-priority)
  [List briefly if < 5, otherwise summarize]

---

Want me to:
- Draft a reply to any of these?
- Read the full text of something?
- File any of these to memory?
```

## Judgment Points

- Don't auto-categorize based on sender alone. Context matters.
- If unsure about urgency, err toward "Worth Reading"
- Surface anything from people the user has active commitments with
- Note if someone has emailed multiple times without a response

## Tone

Quick, scannable, opinionated. The whole point is to save the user from inbox overwhelm. Be decisive about what matters and what doesn't.
