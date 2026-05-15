# Citations and Contradictions

The two disciplines that make wiki pages trustworthy.

## Citations

Every load-bearing claim on a wiki page must cite the memory it came from. Format: `[mem:NNN]` where NNN is the memory ID returned by `memory_recall` or `memory_about`.

### What counts as load-bearing

Cite:
- Facts about the entity (role, location, preferences, history)
- Decisions or commitments
- Quoted preferences or statements
- Dates and timelines
- Relationships between entities

Don't cite (no memory ID exists):
- Synthesis sentences that combine multiple facts (the facts themselves are cited)
- Stylistic glue ("As mentioned above", "On the other hand")
- Generic background that isn't specific to the entity

### Where to put the citation

Inline, at the end of the sentence or claim:

```markdown
Sarah is VP of Engineering at Acme Corp [mem:278].
```

Multiple sources for one claim:

```markdown
The Acme rebrand kickoff was on 2026-03-15 [mem:412, mem:438].
```

### Reading citations back

When the user asks "where did you learn that?" or "show me the source", I use the memory ID to call `memory_recall` with the specific ID and surface the original memory content.

## Contradictions

The wiki must surface contradictions, not hide them.

### Detection

A contradiction exists when two or more memories about the same entity claim mutually exclusive things. Examples:

- Role mismatch: "VP Engineering" in one memory, "CTO" in another, no resolving memory in between.
- Date mismatch: meeting date listed differently in two sources.
- Preference flip: user said person prefers email, then said they prefer Slack, with no "they changed their mind" memory.

The detection rule: if I can write both `X is true [mem:A]` and `X is false [mem:B]` from the same memory pool, that's a contradiction.

### Surfacing

Add a `## ⚠ Contradictions to resolve` section directly after the TLDR. Each contradiction is one bullet:

```markdown
## ⚠ Contradictions to resolve

- **Role title:** Listed as "VP of Engineering" in kickoff notes [mem:142] but "CTO" in the org chart [mem:412]. The org chart is more recent; recommend updating but the user should confirm.
- **Preferred channel:** Said "email only" in onboarding [mem:201] but accepted a Slack invite that's been active since [mem:489]. Probably both work; ask user if they want the preference updated.
```

Update `contradiction_count` in the frontmatter to match the number of bullets.

### Resolving

When the user clarifies a contradiction, I:
1. Strike through the obsolete claim in its original section.
2. Add the resolved fact.
3. Remove the bullet from the contradictions section.
4. Decrement `contradiction_count`.
5. Note the resolution in the History section with the date and the user's clarification cited.

Example after resolution:

```markdown
## At a glance

- **Role:** ~~VP of Engineering~~ CTO at Acme Corp (user confirmed 2026-05-15) [mem:142, mem:412, mem:521]
```

### When NOT to flag

Don't flag minor wording differences ("software engineer" vs "engineer", "team lead" vs "tech lead") unless the user has previously noted they care about the distinction. The contradictions section is for things that actually create confusion if uncovered later.

## Why this matters

Wiki pages without citations are indistinguishable from confabulation. The user has to trust the synthesis without being able to verify it. That violates Claudia's Trust North Star.

Wiki pages that hide contradictions are worse than no pages at all. They give the user false confidence in a fact that's actually disputed. Surfacing contradictions is what makes the wiki *honest* synthesis instead of *plausible* synthesis.

## See also

- The Trust North Star rule for the broader principle
- `memory-audit` for tracing a fact back across all its source memories
- `fix-duplicates` for cases where the "contradiction" is actually two entities that should be merged into one
