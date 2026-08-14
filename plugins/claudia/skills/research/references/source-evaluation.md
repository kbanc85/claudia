# Source Evaluation Criteria

Reference guide for the research skill. Criteria for evaluating source quality and reliability.

---

## Source Authority Tiers

| Tier | Source Type | Trust Level | Example |
|---|---|---|---|
| 1 | Official documentation | High | API docs, company pages, government data |
| 2 | Established publications | High | Major tech blogs, industry reports, peer-reviewed papers |
| 3 | Community knowledge | Medium | Stack Overflow (accepted answers), GitHub issues, well-known blogs |
| 4 | User-generated content | Low-Medium | Forum posts, personal blogs, social media |
| 5 | Aggregator / SEO content | Low | Content farms, AI-generated summaries, listicles |

**Rule:** When sources disagree, prefer higher-tier sources. When equal-tier sources disagree, note the conflict.

---

## Freshness Assessment

| Data Type | Stale After | Action When Stale |
|---|---|---|
| API pricing | 30 days | Verify against official pricing page |
| Software versions | 7 days | Check release page or changelog |
| Company announcements | 90 days | Note the date, offer to check for updates |
| Technical tutorials | 6 months | Check if the framework version matches |
| General knowledge | 1 year | Usually still valid, note the date |

**How to signal staleness:**
- "This is from [date]. Want me to check if it's still current?"
- "The docs I found are for v2.x. You're using v3. Let me find updated docs."

---

## Red Flags in Sources

Watch for these signals that a source may be unreliable:

| Red Flag | What It Means | Action |
|---|---|---|
| No author attribution | May be content-farmed | Seek alternative source |
| No dates anywhere | Cannot assess freshness | Note this when reporting |
| Contradicts official docs | Likely outdated or wrong | Prefer official docs |
| Excessive affiliate links | Commercial motivation | Verify claims independently |
| Copied from other sources | Not original reporting | Find the original |
| AI-generated feel | May contain hallucinations | Cross-reference claims |

---

## Cross-Referencing Rules

**When to cross-reference:**
- Any claim that will influence a decision (pricing, architecture, vendor choice)
- Statistics or data points
- "Best practice" recommendations
- Negative claims about a product or company

**How to cross-reference:**
1. Find the same fact from a second independent source
2. If sources agree: report with confidence
3. If sources disagree: report both with their sources
4. If only one source exists: flag as single-source

**Example output:**
```
Pricing for Service X:
- Official site (fetched today): $29/mo for Pro tier
- Third-party review (from 3 months ago): $25/mo for Pro tier
Note: Price may have increased. The official site is current.
```

---

## Synthesizing vs. Summarizing

| Approach | When to Use | What It Looks Like |
|---|---|---|
| **Summarize** | User wants to understand one source | Condensed version of the source's argument |
| **Synthesize** | User wants to understand a topic across sources | Original analysis connecting multiple sources |
| **Compare** | User is evaluating options | Side-by-side criteria matrix |

**Synthesis rules:**
- Do not just list what each source says. Find the through-line.
- Connect findings to what Claudia knows about the user's context.
- Call out where your synthesis adds interpretation beyond what sources state.
- Keep synthesis shorter than the combined source material.

---

## Memory Integration

When storing research findings in memory:

| Store | Don't Store |
|---|---|
| Specific data points (prices, dates, versions) | Entire article summaries |
| Decisions or announcements affecting user's work | General background information |
| Technical details relevant to active projects | Tutorial content (link instead) |
| Changes from previously known information | Obvious or widely-known facts |

**Provenance format for stored facts:**
```
source:web:[URL] fetched:[date]
```

This ensures future lookups can trace where the fact came from and assess its freshness.
