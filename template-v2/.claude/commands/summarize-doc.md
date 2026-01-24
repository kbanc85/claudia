# Summarize Doc

Create an executive summary of any document.

## Usage
`/summarize-doc`

Then provide the document content (paste, upload, or describe location).

## Input Types

- Pasted text
- PDF content
- Meeting transcript
- Email thread
- Report or article
- Contract or legal document
- Any long-form content

## Summary Levels

### Quick Summary (Default)
- 3-5 bullet points
- Key takeaways only
- 30-second read

### Standard Summary
- Executive summary paragraph
- Key points with context
- Important details
- 2-3 minute read

### Detailed Summary
- Section-by-section breakdown
- All significant points
- Relevant quotes
- 5-10 minute read

Ask: "Quick summary, standard, or detailed?"

## Output Format

### Quick Summary
```
## Summary: [Document Title]

**Key Points:**
- [Point 1]
- [Point 2]
- [Point 3]

**Bottom Line:** [One sentence takeaway]
```

### Standard Summary
```
## Summary: [Document Title]

### Executive Summary
[2-3 paragraph overview]

### Key Points
1. [Point with context]
2. [Point with context]
3. [Point with context]

### Important Details
- [Detail 1]
- [Detail 2]

### Action Items (if any)
- [Action required]

### Bottom Line
[What this means for the reader]
```

### Detailed Summary
```
## Detailed Summary: [Document Title]

### Overview
[Comprehensive executive summary]

### Section Breakdown

#### [Section 1 Name]
[Summary of section]
- Key points
- Relevant quotes

#### [Section 2 Name]
[Continue for each section]

### Key Themes
- [Theme 1]
- [Theme 2]

### Notable Quotes
> "[Important quote]"

### Action Items
- [Action 1]
- [Action 2]

### Questions/Concerns Raised
- [Question]

### Recommendations
[If applicable]
```

## Document Types

### Meeting Transcript
Focus on:
- Decisions made
- Action items
- Key discussion points
- Next steps

### Contract/Legal
Focus on:
- Key terms
- Obligations
- Important dates
- Risks or concerns

### Report/Article
Focus on:
- Main argument/finding
- Supporting evidence
- Implications
- Recommendations

### Email Thread
Focus on:
- What's being discussed
- What's being asked
- Where things stand
- What needs to happen

## Special Handling

### Confidential Documents
- Note confidentiality
- Ask about sharing/storage

### Technical Documents
- Explain jargon if needed
- Focus on implications over details

### Long Documents
- Offer section-by-section approach
- Prioritize most relevant sections

## Quality Checklist

- [ ] Captures main message accurately
- [ ] Key points are genuinely key (not everything)
- [ ] Actionable items clearly identified
- [ ] Length appropriate for summary level
- [ ] Reader can understand without original

## Follow-Up Options

After summarizing:
"Would you like me to:
- Extract action items to track?
- Draft a response?
- Highlight specific sections?
- Save summary to a file?"
