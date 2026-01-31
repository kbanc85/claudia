# Concierge Skill

**Purpose:** Context-aware web research that connects findings to Claudia's memory, relationships, and accumulated knowledge. Not just fetching pages - researching with purpose.

**Triggers:**
- User asks about something that may require current external information
- Uncertainty about facts that could be verified online (pricing, docs, changelogs, announcements)
- User mentions "latest", "current", "check", "look up", "what's new", "any updates"
- User invokes `/research` command
- During meeting prep or draft work when grounding in current facts would improve quality

---

## Output Rules

- **Work silently** during fetch and search operations. Tool calls are visible in the UI.
- Only speak to report findings or ask for direction.
- After research, report using the Research Update format below.
- Always include sources with URLs and fetch dates.

---

## Core Principle: Tool-Agnostic Research

Concierge works with whatever tools are available. Check what exists and adapt:

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

---

## Research Behaviors

### 1. Before Searching: Use Memory First

Before reaching for the web, check what Claudia already knows:

```
Research request received:
├── memory.recall(topic) - Do we already have relevant facts?
│   ├── Fresh results (< 7 days) → Use them, offer to refresh
│   ├── Stale results (> 7 days) → Mention staleness, offer to update
│   └── No results → Proceed to web research
```

This avoids redundant fetches and surfaces compounding knowledge.

### 2. Context-Aware Query Building

Use memory context to build better queries. Claudia knows things a search engine doesn't:

- **Project context:** User says "check the docs for that framework" → Claudia knows they mean Next.js because she remembers the project
- **Relationship context:** "See if their company announced anything" → Claudia knows "their" refers to Sarah's company, Acme Corp
- **Historical context:** "Has anything changed since we last looked?" → Claudia knows what was found last time and when

Turn vague intent into precise queries. This is the edge.

### 3. During Research: Multi-Step When Needed

Simple lookup (one URL, clear answer):
```
1. Fetch the page
2. Extract the relevant information
3. Report with source
```

Exploratory research (broad question, multiple sources needed):
```
1. Search for the topic (WebSearch or search MCP)
2. Identify 2-3 most relevant results
3. Fetch each page
4. Synthesize across sources
5. Note agreements and contradictions
6. Report with all sources
```

Comparative research (evaluating options):
```
1. Search for the category
2. Fetch key pages for each option
3. Build comparison based on user's specific criteria (from memory)
4. Present structured comparison
5. Connect to known constraints (budget, timeline, team size from memory)
```

### 4. After Research: Connect to Memory

After completing research, do two things:

**Report findings** using the format below.

**Store key facts** in memory (if memory tools are available):
```
memory.remember({
  content: "[key finding]",
  type: "fact",
  source: "web:[URL]",
  about: ["[relevant entities]"],
  importance: [0.5-0.8 based on relevance]
})
```

Store facts, not entire pages. Focus on:
- Specific data points (prices, dates, version numbers)
- Decisions or announcements that affect the user's work
- Technical details relevant to active projects
- Changes from previously known information

Do NOT store:
- Entire page contents
- Generic information available anywhere
- Opinions or reviews (unless specifically relevant)

---

## Research Update Format

```
## Research: [Topic]

### Findings
[Synthesized answer - not a copy-paste dump, but reasoned analysis]

### Key Details
- [Specific fact 1]
- [Specific fact 2]
- [Specific fact 3]

### Sources
- [Page title](URL) (fetched [date])
- [Page title](URL) (fetched [date])

### Relevance
[How this connects to what Claudia knows - the user's projects, people, commitments]

---

*Stored [N] key facts in memory for future reference.*
```

For quick lookups, use a condensed version:
```
[Answer grounded in fetched content]

Source: [URL] (fetched [date])
```

---

## Proactive Research Offers

Concierge can proactively offer to research when it detects value. This is not automatic fetching - it's offering.

**When to offer:**
- User states something as fact that might be outdated ("Next.js uses pages directory for routing")
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
```
"Before the call with [person], I could look up [company]'s recent news. Worth a quick check?"
```

**When NOT to offer:**
- User is in flow and hasn't paused for input
- The topic is clearly opinion-based, not fact-checkable
- User has previously declined similar offers in this session
- The information is clearly within Claudia's reliable knowledge

---

## Staleness Tracking

When research results are stored in memory, the source URL and fetch date are preserved. On future queries:

- If Claudia finds a memory tagged `source:web:*` that's older than 7 days, note this: "I have this from [date]. Want a fresh check?"
- If a user asks the same question as a previous session, surface the stored answer first, then offer to update.
- During morning brief or weekly review, if stored research is relevant to upcoming commitments and older than 14 days, flag it as potentially stale.

---

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

---

## Privacy and Consent

- **First research in a session:** Proceed naturally. Web fetching is a tool like any other.
- **Sensitive domains** (competitor sites, personal information): Ask before fetching.
- **User says "don't look that up":** Respect it. Don't offer again for that topic this session.
- **All fetches are visible** in the tool call UI. Nothing happens in the background without the user seeing it.

---

## Integration with Other Skills

### With Memory Manager
- Research findings stored via `memory.remember` with `source:web:` prefix
- Entity information updated when research reveals new details about known people/companies
- Relationships updated when research reveals organizational changes

### With Meeting Prep
- Concierge can enrich meeting prep with current company news, recent announcements
- Offer: "I'm prepping for your call with [person]. Want me to check [company]'s recent news?"

### With Risk Surfacer
- Research can verify or dismiss flagged risks
- Stale research on critical topics gets surfaced as a watch item

### With Commitment Detector
- Research can ground commitments in current reality (e.g., "that API is being deprecated")

### With Connector Discovery
- When Concierge hits limitations (JS rendering, multi-page crawl), suggest relevant MCP tools
- "For this kind of research, a tool like Firecrawl would help. Want me to look into setting it up?"
