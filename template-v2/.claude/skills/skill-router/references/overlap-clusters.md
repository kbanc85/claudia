# Overlap Clusters

The map of which skills could plausibly fire on the same request, with the canonical pick for each cluster. Used by the disambiguation surface of the skill router.

## Cluster: Outbound message composition

| Skill | When canonical |
|-------|----------------|
| `draft-reply` | General email response, no specific meeting context |
| `follow-up-draft` | Post-meeting thank-you, references a specific call |
| `inbox-check` | Triage what to reply to (precedes both drafting skills) |

**Disambiguation pattern:** "Was this from a call we had? If yes, `follow-up-draft`. If not, `draft-reply`."

## Cluster: Memory introspection

| Skill | When canonical |
|-------|----------------|
| `memory-audit` | "What do you know about X?" Content-level provenance, source memories. |
| `memory-health` | "How's my memory?" System-level stats, data quality, embedding counts. |
| `diagnose` | "Memory isn't working." Connectivity troubleshooting, daemon status. |

**Disambiguation pattern:** "Three different memory views: audit (what I know about X), health (system stats), diagnose (connectivity). Which?"

## Cluster: Memory visualization

| Skill | When canonical |
|-------|----------------|
| `brain` | Visual graph view in the browser. Default if the user wants to see relationships. |
| `brain-monitor` | Terminal dashboard. Default if the user is already in a terminal context or wants a lighter view. |

## Cluster: Reflective cadences

A pipeline of related skills by time horizon:

| Skill | Cadence |
|-------|---------|
| `morning-brief` | Daily (start of day) |
| `weekly-review` | Weekly (end of week) |
| `growth-check` | Monthly or quarterly |
| `meditate` | End of session, persistent reflection |

**Disambiguation pattern:** "Daily, weekly, or monthly horizon? `morning-brief` / `weekly-review` / `growth-check`. (And `meditate` at end of session for cross-cutting learnings.)"

## Cluster: Meeting lifecycle

A pipeline by temporal position:

| Skill | Position |
|-------|----------|
| `meeting-prep` | Before the call |
| `capture-meeting` | During or after the call (notes) |
| `follow-up-draft` | After the call (outbound message) |

**Disambiguation pattern:** "Before, during/after, or follow-up? `meeting-prep` / `capture-meeting` / `follow-up-draft`."

## Cluster: Risks, gaps, blind spots

| Skill | When canonical |
|-------|----------------|
| `what-am-i-missing` | User-invoked full sweep. They want to see everything that might be falling through cracks. |
| `risk-surfacer` | Proactive, fires automatically on overdue items and cooling relationships. User doesn't invoke this directly. |

## Cluster: People and relationships

| Skill | When canonical |
|-------|----------------|
| `relationship-tracker` | Ongoing surfacing of context about a person. |
| `new-person` | Create a relationship file for a new contact. |
| `map-connections` | Extract relationships across multiple files into the graph. |
| `connector-discovery` | **NOT about people.** About external service connectors (Gmail, Calendar, Slack). |

**Disambiguation pattern:** If "connector" or "connection" appears: ask "external service or human relationship?" The disambiguation here is essential because `connector-discovery` gets misrouted as a relationship skill.

## Cluster: Patterns, judgment, capability

A pipeline of "we keep doing this" at increasing levels of intervention:

| Skill | Stage |
|-------|-------|
| `pattern-recognizer` | Notice that something is recurring |
| `judgment-awareness` | Apply user-set decision rules to the recurring situation |
| `capability-suggester` | Propose a new command when the same task is repeated manually |
| `hire-agent` | Propose a new subagent when 3+ similar tasks are observed |

## Cluster: Inbound processing

By artifact type:

| Skill | Artifact |
|-------|----------|
| `ingest-sources` | 3+ related documents, batch processing with Extract-Then-Aggregate |
| `file-document` | Single document, file with entity links |
| `capture-meeting` | Meeting transcript or notes specifically |
| `summarize-doc` | Summary without filing as memories |

**Disambiguation pattern:** "One doc or several? Meeting notes or general doc? File it or just summarize? `file-document` / `ingest-sources` / `capture-meeting` / `summarize-doc`."

## Cluster: Writing assistance

| Skill | When canonical |
|-------|----------------|
| `draft-reply` | One-shot draft generation |
| `follow-up-draft` | One-shot, post-meeting |
| `summarize-doc` | One-shot summary |
| `auto-research` | Iterate on an existing draft until it scores well |

**Disambiguation pattern:** "Draft from scratch or iterate on what we have? Drafting skills are one-shot; `auto-research` is the iteration loop."

## Cluster: Vault / knowledge

| Skill | When canonical |
|-------|----------------|
| `wiki` | Write or update synthesized topic pages in the vault |
| `vault-awareness` | Internal skill, fires when user mentions the vault directly |

## When clusters compose

Some requests touch multiple clusters in sequence:

> User: "We just finished the kickoff with Acme. Update everything."

That's potentially:
1. `capture-meeting` (process notes from the kickoff)
2. `wiki` (update the Acme Corp page and the Sarah Chen page)
3. `follow-up-draft` (draft the thank-you)
4. `commitment-detector` (proactive, catches any "I'll send this by Friday" from the notes)

Don't fire all four at once. Run them in order, narrate each step: "First capturing the meeting. Then updating the wiki pages. Want a follow-up draft too?"

## Updating this map

When a new skill ships:
1. Add it to the appropriate cluster (or create a new cluster if it genuinely doesn't fit).
2. Update `canonical_for` and `see_also` fields in `skill-index.json`.
3. If it overlaps with an existing canonical, decide which is now canonical and update the disambiguation pattern.

When a skill is retired:
1. Remove from clusters here.
2. Remove from `skill-index.json`.
3. Update see-also lines in any sibling skills that pointed at it.
