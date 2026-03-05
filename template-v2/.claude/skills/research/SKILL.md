---
name: research
description: Deep research on a topic with web sources, memory integration, and stored findings. Also handles quick context-aware lookups when current information would improve the conversation. Triggers on "research this", "look into", "find out about", "dig into", "look up", "what's new with", "check current", "any updates on", "latest info".
argument-hint: "[topic or question]"
effort-level: high
---

# Research

Deep research on a topic, grounded in web sources and connected to Claudia's memory. Also handles context-aware lookups when current external information would improve quality.

## Usage
`/research [topic or question]`

## How It Works

This skill handles all research, from quick lookups to multi-source deep dives. Unlike a raw web search, research is deliberate: it checks memory first, builds queries using relationship context, searches strategically, fetches relevant sources, synthesizes findings, and stores key facts for future sessions.

## Tool Detection

Research works with whatever tools are available. Check what exists and adapt:

```
Research tool detection:
├── WebFetch available?          → Use for single-page fetches
├── WebSearch available?         → Use for broad searches
├── fetch MCP available?         → Use for cleaner page extraction
├── web-search MCP available?    → Use for DuckDuckGo search (no API key)
├── brave-search MCP available?  → Use for Brave search
├── firecrawl MCP available?     → Use for JS-heavy sites, multi-page crawls
└── Nothing available?           → Tell user honestly, suggest options
```

Never hard-depend on a specific tool. Use the best available. If multiple options exist, prefer in this order:
1. Built-in tools (WebFetch, WebSearch) - zero setup, always there
2. Free MCP servers (fetch, web-search) - no API keys
3. API-backed MCP servers (brave-search, firecrawl) - most capable

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

Before reaching for the web, check what Claudia already knows:

```
memory.recall "[topic]":
├── Fresh results (< 7 days) → Use them, offer to refresh
│   "I have some context on this from [date]:
│    [summary of stored facts]
│    Want me to verify this is still current?"
├── Stale results (> 7 days) → Note staleness, offer to update
│   "Last time I looked into this was [date]. Let me refresh."
└── No results → Proceed to web research
```

This avoids redundant fetches and surfaces compounding knowledge.

### 3. Context-Aware Query Building

Use memory context to build better queries. Claudia knows things a search engine doesn't:

- **Project context:** User says "check the docs for that framework" → Claudia knows they mean Next.js because she remembers the project
- **Relationship context:** "See if their company announced anything" → Claudia knows "their" refers to Sarah's company, Acme Corp
- **Historical context:** "Has anything changed since we last looked?" → Claudia knows what was found last time and when

Turn vague intent into precise queries. This is the edge.

### 4. Research

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

### 5. Synthesize and Report

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

For quick lookups, use a condensed version:
```
[Answer grounded in fetched content]

Source: [URL] (fetched [date])
```

### 6. Store and Connect

After presenting findings:
- Store key facts via `memory.remember` with `source:web:` provenance
- Update relevant entities if research revealed new information
- Connect to existing relationships or projects where relevant

Store facts, not entire pages. Focus on:
- Specific data points (prices, dates, version numbers)
- Decisions or announcements that affect the user's work
- Technical details relevant to active projects
- Changes from previously known information

## Staleness Tracking

When research results are stored in memory, the source URL and fetch date are preserved. On future queries:

- If Claudia finds a memory tagged `source:web:*` that's older than 7 days, note this: "I have this from [date]. Want a fresh check?"
- If a user asks the same question as a previous session, surface the stored answer first, then offer to update
- During morning brief or weekly review, if stored research is relevant to upcoming commitments and older than 14 days, flag it as potentially stale

## Proactive Research Offers

Research can proactively offer to look things up when it detects value. This is not automatic fetching, it's offering.

**When to offer:**
- User states something as fact that might be outdated
- Discussion involves pricing, deadlines, or terms that change over time
- Meeting prep for a company Claudia hasn't researched recently
- User is making a decision that could benefit from current data

**How to offer:**
```
"That might have changed since [version/date]. Want me to check the current docs?"
```
```
"I have info on [topic] from [date]. Want me to see if anything's updated?"
```

**When NOT to offer:**
- User is in flow and hasn't paused for input
- The topic is clearly opinion-based, not fact-checkable
- User has previously declined similar offers in this session

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

## Error Handling

When fetches fail (403, timeout, JS-only page):
```
"I couldn't access that page directly - [reason].
Options:
- Try a different URL if you have one
- Paste the content and I'll work with it
- [If enhanced MCP available] I can try with a different tool"
```

Never silently fail. Never guess what a page says. If the fetch didn't work, say so.

## Privacy and Consent

- **Sensitive domains** (competitor sites, personal information): Ask before fetching
- **User says "don't look that up":** Respect it. Don't offer again for that topic this session
- **All fetches are visible** in the tool call UI. Nothing happens in the background without the user seeing it

## Integration with Other Skills

### With Meeting Prep
- Research can enrich meeting prep with current company news, recent announcements
- Offer: "I'm prepping for your call with [person]. Want me to check [company]'s recent news?"

### With Risk Surfacer
- Research can verify or dismiss flagged risks
- Stale research on critical topics gets surfaced as a watch item

### With Connector Discovery
- When research hits limitations (JS rendering, multi-page crawl), suggest relevant MCP tools
