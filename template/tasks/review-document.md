# Task: Review Document

---

## Trigger

- `/review-contract`
- `/summarize-doc`
- "Review this contract"
- "What are the key terms in this?"
- "Summarize this document"
- "What should I watch out for?"

---

## Input

- **Type**: Document (contract, agreement, proposal, report)
- **Format**: Text paste, file, or PDF
- **Source**: Email attachment, file system, shared link

---

## Context

- [x] **Person-specific** — If from a known person, reference `people/`
- [x] **Project-specific** — If part of a project, file in `projects/[project]/documents/`

---

## Transformation

### 1. Extract
**For Contracts/Agreements:**
- **Parties** — Who's involved
- **Key terms** — Payment, timeline, deliverables
- **Obligations** — What you're committing to
- **Rights** — What you're getting
- **Risk clauses** — Liability, indemnification, termination
- **Important dates** — Deadlines, renewal dates, notice periods
- **Red flags** — Unusual terms, one-sided provisions

**For General Documents:**
- **Purpose** — What is this document for
- **Key points** — Main takeaways (5-7 max)
- **Action items** — What needs to happen
- **Open questions** — What's unclear or needs follow-up

### 2. Organize
- Create structured summary with clear sections
- Highlight risks/concerns separately
- Note deadlines and commitments separately

### 3. Connect
- If contract creates commitments, prepare to add to `context/commitments.md`
- If contract involves known person, note in their file
- File to appropriate project folder

### 4. Synthesize
- Executive summary (100-200 words)
- Key terms table (term | our obligation | their obligation)
- Risk assessment (low/medium/high concerns)
- Recommended questions or negotiation points

---

## Decisions Required

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| Document type | Contract / Proposal / Report / Other | Infer from content, ask if unclear |
| Depth of review | Quick scan / Standard / Deep analysis | Standard unless specified |
| Risk tolerance | Conservative / Moderate / Aggressive | Moderate (flag unusual terms) |
| File location | Project folder / Person folder / General | Ask if unclear |

---

## What Good Looks Like

- [ ] Executive summary captures the essence in 100-200 words
- [ ] All key terms are identified and explained in plain language
- [ ] Risks are clearly flagged with severity assessment
- [ ] Dates and deadlines are extracted and highlighted
- [ ] Action items are clear (what needs decision, what needs follow-up)
- [ ] Legal jargon is translated to plain English
- [ ] Nothing important is buried or glossed over

---

## Judgment Points

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| Risk assessment | Interpretation required | "I see [X] as a [low/medium/high] risk because [Y]. Does that match your read?" |
| Adding commitments | Creates obligations | "This commits you to [X] by [date]. Add to tracking?" |
| Recommending negotiation | Strategic decision | "This clause seems one-sided. Worth pushing back on?" |
| Filing | Organization choice | "File to [location]?" |

---

## Notes

- I am not a lawyer. This is analysis, not legal advice.
- For high-stakes contracts, always recommend professional review
- Watch for auto-renewal clauses and notice periods
- Pay attention to indemnification and liability caps
- Note anything that seems unusual compared to standard terms
- If document is very long, offer section-by-section breakdown option
