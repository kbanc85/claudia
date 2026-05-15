# Wiki Page Template

Copy this when creating a new wiki page. Fill the placeholders with synthesized content from memories. Cite every load-bearing claim with `[mem:NNN]` where NNN is the memory ID.

```markdown
---
entity: "ENTITY NAME"
entity_type: person | organization | project | concept | location
last_updated: YYYY-MM-DD
source_memories: [NNN, NNN, NNN]
contradiction_count: 0
---

# ENTITY NAME

> One-sentence TLDR. What's the essential fact about this entity that Claudia should know on first glance.

## At a glance

- **Role / Type:** what they are or do [mem:NNN]
- **First contact / appeared:** when they entered the user's world [mem:NNN]
- **Last interaction:** most recent meaningful touchpoint [mem:NNN]
- **Communication / Operational style:** how they prefer to work, if known [mem:NNN]

## What matters to them

Synthesized prose. What are their goals, preferences, concerns? What context shapes how they show up? Cite every claim. Keep this section to the load-bearing facts; not everything you know belongs here.

## Current threads

- **Thread name:** status, what's open, who owes what [mem:NNN]
- (more threads, one bullet each)

If no open threads, omit this section.

## History

Reverse chronological. Most recent first. One bullet per significant interaction or fact-update.

- YYYY-MM-DD: what happened [mem:NNN]
- YYYY-MM-DD: what happened [mem:NNN]

Cap at ~10 entries per page. Older history is in raw memory; the page surfaces what's still relevant.

## Related

- [[Other Entity 1]]
- [[Other Entity 2]]

Use Obsidian wikilink format. The graph view picks these up.

## Notes

Anything that doesn't fit the structured sections above. Use sparingly. If this section grows past one or two paragraphs, the content probably belongs in one of the structured sections.
```

## If contradictions exist

Insert this section directly after the TLDR, before "At a glance":

```markdown
## ⚠ Contradictions to resolve

- **Topic:** Description of the contradiction. Memory A says X [mem:NNN], memory B says Y [mem:NNN]. Recommended resolution or open question for the user.
```

Increment the `contradiction_count` in the frontmatter accordingly.

## If the entity is dormant or sensitive

Don't write a wiki page. Stay in raw memory only. See the parent SKILL.md for the rules.

## Page size discipline

- Minimum: ~300 words. Below that, the page isn't earning its keep over a memory recall.
- Typical: 500 to 1000 words.
- Maximum: ~1500 words. If a page is growing past that, split into multiple pages (e.g., `Sarah-Chen.md` + `Sarah-Chen-Engagement-2026.md`) and link them with `[[wikilinks]]`.

## Style reminders

- No em dashes. Use commas, periods, colons, or parentheses.
- Plain language. Direct sentences.
- Cite every meaningful claim with `[mem:NNN]`.
- Cross-link related entities with `[[Entity Name]]`.
