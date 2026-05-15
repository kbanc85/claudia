---
name: skill-router
description: Help users discover available skills and help Claudia pick the right one when a request is ambiguous. Two surfaces: discovery (user says "what can you do?", "/skills", "show me your skills") returns a categorized list; disambiguation (user's request matches 2+ skills) names the candidates and proceeds with the canonical one. Use when user asks about Claudia's capabilities, requests something ambiguous between adjacent skills, or seems unsure which skill they need.
effort-level: low
invocation: contextual
---

# Skill Router

Two jobs: help the user find the skill they need, and help me (Claudia) pick the right skill when their request straddles two or more.

## Why this exists

The shipped catalog has ~42 user-facing skills. Two common failure modes:

1. **Users don't know what's available.** They type "morning brief" because they've seen `/morning-brief` somewhere, but they don't know `/inbox-check`, `/pipeline-review`, or `/what-am-i-missing` exist. Friction.
2. **Ambiguous requests fire the wrong skill.** "Summarize this" could be `summarize-doc`, `capture-meeting`, or `file-document` depending on what comes next. I sometimes pick the wrong one, the user gets the wrong output, both of us waste a turn.

This skill addresses both.

## Surface 1: Discovery

When the user says "what can you do?", "/skills", "show me your skills", "list commands", "what skills do you have":

Respond with a categorized list. Keep it scannable:

```
**📋 Daily flow**
- /morning-brief         start-of-day digest
- /inbox-check          email triage across configured accounts
- /meeting-prep [person] one-page brief before a call
- /capture-meeting       process meeting notes after a call
- /follow-up-draft       draft a post-meeting thank-you

**📊 Reviews & reflection**
- /weekly-review         end-of-week reflection
- /growth-check          monthly or quarterly self-development
- /what-am-i-missing     overdue, cooling, blind-spot sweep

**💼 Pipeline & business**
- /pipeline-review       active opportunities + stalled items
- /client-health         health check across active clients
- /financial-snapshot    revenue, expenses, cash position

**📚 Knowledge & memory**
- /memory-audit          what I know about an entity
- /memory-health         memory system stats
- /wiki                  write or update a synthesized wiki page
- /map-connections       extract relationships across files
- /deep-context          full-context analysis for important decisions

**✍️ Drafting**
- /draft-reply           general email response
- /summarize-doc         executive summary of a document
- /auto-research         iterate on a draft until it scores well

**🏗 Setup**
- /new-person            create a relationship file
- /new-workspace         new project or client workspace
- /file-document         save a document with entity links
- /ingest-sources        batch-process multiple sources
- /diagnose              troubleshoot memory connectivity
```

Don't list every skill. List the ones a user is most likely to invoke directly. Internal skills (proactive ones like `commitment-detector`, `pattern-recognizer`, `risk-surfacer`) fire on their own and don't need to be in the discovery list.

If the user asks `/skills <topic>` or "what skills are about <topic>", filter the list to skills whose names or descriptions match, and explain the cluster. Example for `/skills meeting`:

```
Three skills for meetings, in order of when they fire:

- /meeting-prep [person]  → before the call (one-page brief)
- /capture-meeting        → during or after (process notes)
- /follow-up-draft        → after (post-meeting email)
```

## Surface 2: Disambiguation

When the user's request matches 2+ skills, name the candidates briefly and proceed with the canonical one. Don't make the user choose; choose for them, and tell them what you chose.

### How to detect ambiguity

A request is ambiguous when:
- The trigger phrase appears in 2+ skill descriptions
- The request is in one of the known overlap clusters (see references/overlap-clusters.md)
- The artifact type is ambiguous (a "transcript" could be a meeting transcript → `capture-meeting`, or a research interview → `ingest-sources`, or just a generic document → `file-document`)

### How to disambiguate

Pattern: "Sounds like X or Y. I'll do X. Say so if you wanted Y."

Examples:

> User: "Help me draft a follow-up"
> Claudia: "Sounds like either `draft-reply` (general response) or `follow-up-draft` (post-meeting thank-you with meeting context). Was this from a call we had? If yes, `follow-up-draft`; if not, `draft-reply`. Defaulting to `follow-up-draft` since you said 'follow-up'."

> User: "Summarize this meeting"
> Claudia: "I'll use `capture-meeting` (extracts decisions, commitments, blockers from meeting notes). If you wanted a one-shot prose summary without filing as memories, say `summarize-doc` instead."

> User: "What's going on?"
> Claudia: "Default for that phrasing is `morning-brief`. Was that what you wanted, or did you mean `/what-am-i-missing` (risks and gaps), `pipeline-review` (deal status), or just an answer about a specific entity? Going with `morning-brief`."

The pattern: pick the canonical, name the alternative, run.

### When NOT to disambiguate

- The request is unambiguous. Don't manufacture options.
- The user has been specific. "Draft a reply to this email" is `draft-reply`, no need to mention `follow-up-draft`.
- The disambiguation explanation would be longer than the actual response. For short tasks, just do the canonical thing and let the user redirect.

## Overlap clusters (the canonical map)

See `references/overlap-clusters.md` for the full map. The clusters I check most often:

| Cluster | Canonical | Adjacent |
|---------|-----------|----------|
| Outbound messages | `draft-reply` (general), `follow-up-draft` (post-meeting) | `inbox-check` (triage before drafting) |
| Memory views | `memory-audit` (content), `memory-health` (system), `diagnose` (connectivity) | |
| Visualization | `brain` (3D web), `brain-monitor` (terminal) | |
| Reflective cadences | `morning-brief` (daily) → `weekly-review` (weekly) → `growth-check` (monthly+) → `meditate` (session) | |
| Meeting lifecycle | `meeting-prep` (before) → `capture-meeting` (during/after) → `follow-up-draft` (after, outbound) | |
| Risks and gaps | `what-am-i-missing` (user-invoked) | `risk-surfacer` (proactive auto-fire) |
| People and relationships | `relationship-tracker` (ongoing), `new-person` (create), `map-connections` (extract graph) | `connector-discovery` (external services, NOT people) |
| Patterns/judgment/capability | `pattern-recognizer` (notice) → `judgment-awareness` (apply rules) → `capability-suggester` (propose commands) | `hire-agent` (propose new subagents) |
| Inbound processing | `ingest-sources` (multi-doc), `file-document` (single doc), `capture-meeting` (meeting only), `summarize-doc` (no filing) | |

## Skill index integration

The `skill-index.json` file at `template-v2/.claude/skills/skill-index.json` is the structured catalog this skill reads. Each entry has:

- `name`: slug
- `description`: one-line description
- `category`: which discovery category the skill falls in (daily, reviews, pipeline, knowledge, drafting, setup, internal)
- `canonical_for`: list of request patterns where this skill is the canonical choice (used by disambiguation)
- `see_also`: list of adjacent skills (set in PR3's see-also work)

When skill-router is invoked, it loads skill-index.json and uses these fields. The discovery list above is generated from `category`. Disambiguation uses `canonical_for` and `see_also`.

## See also

- `agent-dispatcher` for routing tasks to subagents (different concept: this is about which Claudia *skill* fires; agent-dispatcher is about which *subagent* gets a task)
- `capability-suggester` for proposing *new* skills when patterns emerge that current skills don't cover

## Open questions for future versions

- **Telemetry.** Logging which skills fire on which inputs would let me learn over time which routings are wrong and propose corrections via `capability-suggester`. Not in this version.
- **Per-user customization.** Some users invoke `weekly-review` weekly; others never use it. The discovery list should adapt to the user's actual usage over time. Not in this version.
- **Skill search by example.** "Show me a skill that does X for Y" → semantic search over skill descriptions. Not in this version; today the user filters by keyword via `/skills <keyword>`.
