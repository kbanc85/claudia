# Task: [Task Name]

> Copy this template to create a custom task blueprint. Claudia uses blueprints to handle recurring work consistently—extracting the right information, updating the right files, and pausing at the right moments for your judgment.

---

## Trigger

When this task is activated. Include natural language phrases that should invoke this blueprint.

- [Primary trigger phrase, e.g., "Process meeting notes from [client]"]
- [Alternative trigger, e.g., "Here's a transcript from..."]
- [Slash command if applicable, e.g., "/capture-meeting"]

---

## Input

What information Claudia will receive:

- **Type**: [transcript, email, document, verbal instruction, file path]
- **Format**: [text paste, file upload, URL, spoken summary]
- **Source**: [where this typically comes from]

---

## Context

Where this task lives. Check all that apply:

- [ ] **Person-specific** — Reference `people/[person].md`
- [ ] **Project-specific** — Use `projects/[project]/`
- [ ] **Cross-cutting** — Use `context/` or `insights/`
- [ ] **Content-related** — Use `content/`

---

## Transformation

What Claudia should do with the input:

### 1. Extract
What to pull out:
- [e.g., Decisions made]
- [e.g., Commitments with deadlines]
- [e.g., Action items with owners]
- [e.g., Key points or themes]

### 2. Organize
Where to file things:
- [e.g., Save to `[location]` with naming convention `YYYY-MM-DD-[description].md`]
- [e.g., Create summary in `[location]`]

### 3. Connect
What to link or update:
- [e.g., Link commitments to `context/commitments.md`]
- [e.g., Update `people/[person].md` with new context]
- [e.g., Reference related projects or past decisions]

### 4. Synthesize
What summary or analysis to produce:
- [e.g., X-word summary focusing on...]
- [e.g., Bulleted action items with owners]
- [e.g., Risk assessment with recommendations]

---

## Decisions Required

Choices Claudia must make or surface. Use this table format:

| Decision Point | Options | Default Behavior |
|---------------|---------|------------------|
| [e.g., Priority level] | High / Medium / Low | Suggest based on [criteria] |
| [e.g., File location] | Option A / Option B | Auto-select if [condition], else ask |
| [e.g., Owner attribution] | User / Other person | Default to user unless clear |

---

## What Good Looks Like

Quality criteria for this task. Claudia will validate output against these:

- [ ] [Specific quality check, e.g., "All action items have owners"]
- [ ] [e.g., "Every commitment has a deadline (even if approximate)"]
- [ ] [e.g., "Summary is under X words"]
- [ ] [e.g., "Related files are cross-referenced"]
- [ ] [e.g., "No generic AI-sounding language"]

---

## Judgment Points

Where Claudia pauses for your approval before proceeding:

| Step | Why Approval Needed | How to Ask |
|------|---------------------|------------|
| [e.g., Adding commitment] | User must own promises | "Add to commitments: [item] by [date]?" |
| [e.g., Updating sentiment] | Subjective assessment | "Update [person] sentiment to [level]?" |
| [e.g., Filing to location] | Might be wrong | "File this to [location]?" |
| [e.g., Sending draft] | External communication | Show draft, ask "Should I send this?" |

---

## Notes

Optional: Any additional context, edge cases, or preferences for how this task should be handled.

---

*Created: YYYY-MM-DD*
*Last Updated: YYYY-MM-DD*
