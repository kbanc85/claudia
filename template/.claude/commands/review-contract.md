# Review Contract

Analyze a contract or agreement for key terms, risks, and action items. Uses the `tasks/review-document.md` blueprint.

## Usage

`/review-contract` — then provide or paste the contract

## Disclaimer

**I am not a lawyer.** This analysis helps you understand the document, but for high-stakes agreements, always get professional legal review.

## What to Extract

### Key Terms
- **Parties**: Who's involved
- **Services/Deliverables**: What's being provided
- **Payment**: Amount, schedule, terms
- **Timeline**: Start, end, milestones
- **Termination**: How either party can exit

### Obligations
**Your obligations:**
- What you're committing to do
- Standards you must meet
- Reporting requirements

**Their obligations:**
- What they're committing to
- What you can expect

### Risk Areas
- **Liability**: Caps, exclusions, indemnification
- **IP**: Who owns what
- **Confidentiality**: What's protected
- **Non-compete/Non-solicit**: Restrictions on you
- **Termination penalties**: Costs of early exit
- **Auto-renewal**: Watch for this

### Important Dates
- Effective date
- Deadline-driven obligations
- Renewal/termination notice periods
- Payment due dates

## Output Format

```
## Contract Review: [Document Name]

### Summary
[2-3 sentences: what this agreement does]

### Parties
- [Party 1]: [Role]
- [Party 2]: [Role]

### Key Terms
| Term | Details |
|------|---------|
| Duration | [X] |
| Value | [X] |
| Payment Terms | [X] |
| Termination | [X] |

### Your Obligations
- [Obligation 1]
- [Obligation 2]

### Their Obligations
- [Obligation 1]

### Risk Assessment

**🔴 High Concern:**
- [Issue] — [Why it matters] — [Suggestion]

**🟡 Medium Concern:**
- [Issue] — [Why it matters]

**🟢 Standard:**
- [Terms that are typical/reasonable]

### Important Dates
- [Date]: [What happens]

### Questions to Clarify
- [Ambiguous term or unclear point]

### Recommended Actions
- [ ] [Action to take before signing]
- [ ] [Negotiation point to raise]
```

## Common Red Flags

- Unlimited liability
- Broad indemnification
- One-sided termination rights
- Auto-renewal without notice
- Ownership of all work product
- Non-compete that's too broad
- Payment terms too long
- Vague deliverables

## Judgment Points

- "This creates commitments. Add to tracking?"
- "This clause seems one-sided. Worth negotiating?"
- "Get professional review before signing?"

## For High-Stakes Agreements

Recommend professional review for:
- Significant financial value
- Long-term commitments
- Complex IP arrangements
- Employment agreements
- Anything you're not 100% comfortable with
