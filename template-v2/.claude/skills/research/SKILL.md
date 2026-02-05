---
name: research
description: Deep research on a topic with web sources, memory integration, and stored findings. Triggers on "research this", "look into", "find out about", "dig into".
argument-hint: "[topic or question]"
effort-level: high
---

# Research

Deep research on a topic, grounded in web sources and connected to Claudia's memory.

## Usage
`/research [topic or question]`

## How It Works

This command activates the Concierge skill for focused, multi-step research. Unlike a quick web search, `/research` is deliberate: it checks memory first, searches strategically, fetches relevant sources, synthesizes findings, and stores key facts for future sessions.

## Process

### 1. Scope the Research

Ask if not obvious from the topic:
```
"Before I dig in, a quick clarification:
- Are you looking for a quick answer or a thorough comparison?
- Any specific angle? (pricing, technical, competitive, general)"
```

If the topic is clear and narrow, skip this and go straight to work.

### 2. Check Memory First

```
memory.recall([topic]):
├── Existing knowledge found -> Surface it
│   "I have some context on this from [date]:
│    [summary of stored facts]
│    Want me to verify this is still current?"
├── Stale knowledge found -> Note it
│   "Last time I looked into this was [date]. Let me refresh."
└── Nothing found -> Proceed to web research
```

### 3. Research

Use whatever tools are available (see Concierge skill for tool detection).

**For factual lookups** (one clear answer expected):
- Search for the topic
- Fetch the most authoritative source
- Extract the answer
- Verify with a second source if the claim is significant

**For exploratory research** (understanding a topic):
- Search broadly
- Fetch 3-5 relevant pages
- Synthesize across sources
- Note where sources agree and disagree

**For comparative research** (evaluating options):
- Identify the options
- Fetch primary source for each
- Build comparison against criteria relevant to the user
- Use memory context to weigh what matters (budget, team size, timeline)

**For competitive/market research:**
- Fetch company pages, recent news, announcements
- Cross-reference with what Claudia knows about the user's position
- Focus on actionable intelligence, not general summaries

### 4. Synthesize and Report

```
## Research: [Topic]

### Summary
[2-3 paragraph synthesis - this is analysis, not copy-paste]

### Key Findings
1. **[Finding]** - [Detail with context]
2. **[Finding]** - [Detail with context]
3. **[Finding]** - [Detail with context]

### Comparison (if applicable)
| Criteria | Option A | Option B | Option C |
|----------|----------|----------|----------|
| [Relevant to user] | ... | ... | ... |

### Sources
- [Source 1](URL) (fetched [date])
- [Source 2](URL) (fetched [date])
- [Source 3](URL) (fetched [date])

### How This Connects
[Relate findings to user's projects, people, commitments, or decisions from memory]

### What I'd Flag
[Risks, opportunities, or things that surprised Claudia]

---

*Key facts stored in memory. I'll remember this next time the topic comes up.*
```

### 5. Store and Connect

After presenting findings:
- Store key facts via `memory.remember` with `source:web:` provenance
- Update relevant entities if research revealed new information
- Connect to existing relationships or projects where relevant

## Tone

- Analytical, not encyclopedic. Synthesize, don't dump.
- Opinionated where warranted. "Based on what I know about your setup, option B seems strongest because..."
- Honest about limitations. "I could only find pricing for two of the three. The third might require a sales call."
- Concise. Research output should be shorter than the source material, not longer.

## Follow-Up Options

After presenting research:
```
"Want me to:
- Dig deeper on any of these?
- Draft something based on these findings?
- Set a reminder to re-check this in [timeframe]?
- Save this as a reference doc?"
```

## Without Web Tools

If no web tools are available:
```
"I don't have web access in this session. I can:
- Share what I know from memory and training
- Work with content you paste in
- Help you set up web search tools for future sessions

What works best?"
```
