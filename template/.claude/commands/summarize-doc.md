# Summarize Doc

Create an executive summary of any document.

## Usage

`/summarize-doc` — then provide the document

## Inputs

- Paste text directly
- Provide a file path
- Share a document link (if accessible)

## Process

### 1. Understand the Document
- What type of document is it?
- Who's the intended audience?
- What's the purpose?

### 2. Extract Key Elements

**For Reports/Analyses:**
- Main findings
- Key data points
- Recommendations
- Implications

**For Proposals/Decks:**
- Core offer/ask
- Key benefits
- Timeline/costs
- Decision points

**For Meeting Notes/Transcripts:**
- Decisions made
- Action items
- Key discussion points
- Next steps

**For Emails/Threads:**
- What's being asked
- Current status
- What needs to happen

### 3. Synthesize
- Lead with the "so what"
- Organize by importance, not document order
- Highlight action items

## Output Format

```
## Summary: [Document Title/Type]

### TL;DR
[1-2 sentences: the essential takeaway]

### Key Points
1. [Most important point]
2. [Second most important]
3. [Third]

### Action Items
- [ ] [Action] — [Owner if known]

### Details Worth Noting
- [Important detail 1]
- [Important detail 2]

### Questions/Unclear Points
- [Anything ambiguous or needing clarification]

---
*Source: [X] pages/words | Summarized: [date]*
```

## Length Guidelines

Scale summary to document length:
- 1-2 pages → 100-150 words
- 5-10 pages → 200-300 words
- 10+ pages → 300-500 words or section-by-section

Ask if they want more or less detail.

## Quality Criteria

- [ ] Captures the essential message
- [ ] Action items are clear
- [ ] Organized by importance
- [ ] No critical information lost
- [ ] Readable in 1-2 minutes

## Integration

Offer to:
- Save summary to appropriate folder
- Extract commitments to `context/commitments.md`
- Update relevant `people/` files with context

## For Long Documents

Offer options:
- "This is [X] pages. Want an executive summary, or section-by-section breakdown?"
- "Focus on any particular aspect?"
