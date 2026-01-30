# Memory Manager Skill

**Purpose:** Handle cross-session persistence using the enhanced memory system (MCP) with fallback to markdown files.

**Triggers:** Session start (load) and session end (save).

---

## Output Rules

When processing memory operations (storing, recalling, updating files, creating person/project files):

- **Work silently.** Do not narrate each tool call. No "Let me check...", "Now I'll update...", "Let me store this in memory..."
- Tool calls are visible in the UI. They do not need verbal explanation.
- Only speak to the user when:
  - Reporting results (use the Session Update format below)
  - Something requires user input or a decision
  - Surfacing strategic analysis, flags, or insights
- After completing a batch of memory operations, report using:

```
**Created:** [list of new files]
**Updated:** [list of changed files]
**Stored:** [count of memories, entities, relationships]
**Flag:** [anything the user should act on or be aware of]
```

If there is strategic analysis worth sharing, add it after the update block in normal prose.

---

## File Write Efficiency

Before creating a new person or project file:

1. Check if more data is incoming in this session (transcript, email, notes the user is about to paste)
2. If the user just shared a summary and is likely to share full details, **wait for the details** before writing
3. If uncertain, ask: "I have enough for a draft. Want me to write it now, or are you about to share more?"
4. Never write a file you will immediately rewrite. One write with complete data is better than two writes.

---

## Information Lookup Order

When looking for information about a person or topic:

1. `memory.about("[entity name]")` - single call, returns all memories + relationships + recent session narratives
2. If no results, check if `people/[name].md` exists - single file read
3. If neither has it, it's unknown. Tell the user and ask if they have source material.
4. **Last resort:** `episodic-memory__search` (cross-workspace conversation history). Only use this when Claudia's own memory and local files have nothing, and the information might exist in a prior Claude Code conversation from another workspace.

Do NOT:
- Call both `memory.recall` AND `memory.about` for the same entity (about is the targeted lookup, recall is for broad searches)
- Search episodic memory for information that should be in Claudia's memory
- Jump to episodic-memory search before exhausting Claudia's own memory system
- Parse raw `.jsonl` session logs. The cost-to-recovery ratio is poor and it rarely succeeds. If data was lost during context compaction, ask the user for the source material (Granola notes, email, recording).

---

## Memory System Detection

At session start, check which memory system is available:

1. **Enhanced Memory (Preferred):** Check if `memory.recall` MCP tool is available
2. **Fallback:** Use markdown files in `context/` directory

```
Session Start:
├── Check if memory.recall tool exists
│   ├── YES → Use enhanced memory system
│   └── NO → Check if this might be a restart issue
│       ├── Check daemon health: curl -s localhost:3848/health
│       │   ├── Healthy but no MCP tools → User needs to restart Claude Code
│       │   └── Not healthy → Fall back to markdown files
```

---

## Troubleshooting MCP Connection

When enhanced memory SHOULD be available but isn't detected:

### Signs of Misconfiguration

- Daemon is running (health check passes)
- `.mcp.json` has claudia-memory entry
- But `memory.recall` tool is not available

### User Guidance

If fallback to markdown occurs but the daemon appears healthy, guide the user:

```
"I notice the enhanced memory daemon is running (health check passed),
but I can't access the memory tools. This usually means Claude Code
needs to be restarted to pick up the MCP configuration.

Try closing this terminal and running 'claude' in a new terminal.

You can also run: ~/.claudia/diagnose.sh for a full diagnostic."
```

### Detection Flow

Before silently falling back to markdown, if `.mcp.json` exists with claudia-memory:

1. Quietly check daemon health: `curl -s localhost:3848/health`
2. If healthy but no MCP tools available → Restart needed
3. Surface the restart message to the user instead of silent fallback
4. Only fall back to markdown if the daemon is genuinely not running

### Why This Happens

Claude Code reads `.mcp.json` at startup. If the memory system is installed while Claude Code is already running in the same terminal, the new MCP server won't be detected until Claude Code is restarted in a new terminal session.

---

## Episodic Memory Plugin (Optional)

The `episodic-memory` plugin (`episodic-memory__search`) is a separate Claude Code plugin, not part of Claudia's memory daemon. It provides cross-workspace conversation search (searching previous Claude Code sessions across all projects).

### Detection

At session start, check if `episodic-memory__search` tool is available alongside Claudia's own memory tools. These are independent systems:

```
Memory availability matrix:
├── Claudia daemon + episodic plugin → Full capability
├── Claudia daemon only → Normal operation (most common)
├── Episodic plugin only → Cross-session search works, but no structured memory
└── Neither → Markdown fallback only
```

### When Episodic Plugin Is Unavailable

If `episodic-memory__search` is not available:
- Cross-workspace context is limited to what Claudia's own memory has stored
- If the user asks about something from a different project's conversation, inform them: "I don't have cross-workspace conversation search available. Can you point me to the relevant files or share the context?"
- Do not suggest installing the plugin unprompted. Only mention it if the user is actively looking for cross-session data and hitting a wall.

### When to Use Episodic Search

Episodic memory is the **last resort** in the lookup order. Only reach for it when:
- Claudia's own `memory.recall` and `memory.about` returned nothing
- Local files (`people/`, `context/`) have no relevant data
- The information likely exists in a prior Claude Code conversation (possibly from another workspace)

Do not use episodic search for information that Claudia's own memory should have. If important context is missing from Claudia's memory, that's a signal to store it, not to search conversation logs.

---

## Efficiency Rules

Avoid redundant memory calls within a session:

- **Session-local awareness:** If you already called `memory.about` for an entity in this session, do not call it again. Use the results you already have.
- **Recall dedup:** Do not call `memory.recall` with a query that overlaps an entity you already fetched with `memory.about`. The about call already returned that entity's full context.
- **File-vs-memory rule:** If you just read a person file (`people/[name].md`), do not also call `memory.about` for the same person unless you need memories not in the file (e.g., cross-project context or recent session narratives).
- **Batch preference:** When you need context on multiple entities at once, prefer `memory.batch` over sequential `memory.about` calls.
- **Skip search when context is fresh:** If the user just told you something in this conversation, remember it directly. Don't search memory for what was just said.

---

## Session Start (Enhanced Memory)

When the enhanced memory system is available:

### 0. Catch Up on Unsummarized Sessions

Before anything else, check for sessions that ended without a summary:

```
Call memory.unsummarized:
├── If results returned → Previous session(s) ended without summary
│   For each unsummarized session:
│   ├── Review the buffered turns
│   ├── Write a retroactive narrative summary
│   ├── Extract structured facts, commitments, entities, relationships
│   └── Call memory.end_session to finalize
├── If no results → Clean slate, proceed normally
```

This handles the case where the user closed the terminal, lost connection, or simply forgot to let Claude wrap up. The raw turn data is preserved, so Claude can reconstruct what happened and generate a proper summary retroactively.

**When writing a retroactive summary:**
- Be honest that this is reconstructed from turn fragments, not live context
- Focus on extracting the signal: what decisions were made, what was discussed, what was left unresolved
- Still write the narrative with full context and texture, not just bullet points
- Include a note like "Reconstructed from N buffered turns from [date]"

### 1. Minimal Startup (2 calls max)

```
1. Read context/me.md (for greeting personalization, name, archetype)
2. Call memory.predictions (surfaces overdue items, cooling relationships, patterns)
```

Do NOT read learnings.md, patterns.md, commitments.md, or waiting.md at startup. These duplicate what is already in the memory database. Read them on-demand only when a specific file becomes relevant during the session.

### 2. Greeting

Use me.md + predictions to build the greeting. See Greeting Calibration below.

### 3. On-Demand Lookup (during session)

When a person, project, or topic comes up:
```
Call memory.about with the entity name:
├── Returns all memories + relationships + recent session narratives in one call
├── Surface relevant context naturally
└── Only read people/[name].md if memory.about returns nothing
```

---

## Session Start (Markdown Fallback)

If enhanced memory is unavailable, use traditional file loading:

1. **context/me.md** - User profile and preferences
2. **context/learnings.md** - What I've learned about working with them
3. **context/patterns.md** - Observed patterns to keep in mind
4. **context/commitments.md** - Active commitments (for awareness)
5. **context/waiting.md** - What we're waiting on

---

## Greeting Calibration

**Never use the same greeting twice.** Greetings should feel natural and personal based on context.

**First session (no me.md):**
Trigger onboarding with a warm, varied introduction. See onboarding skill for examples.

**Returning user (with predictions):**
Use their name and reference something relevant, including any predictions:
- "Morning, Sarah. You've got that investor call at 2. Also, I noticed you haven't touched base with Mike in 45 days."
- "Hey James. A few predictions surfaced overnight: [list top 2-3]"
- "Back at it. The Acme proposal is due tomorrow. Want me to pull it up?"

**After long absence (7+ days):**
Acknowledge the gap warmly, surface what matters from predictions:
- "Hey, it's been a minute. I've got 3 predictions that built up. The most important: Sarah's deadline passed while you were away."

---

## During Session (Enhanced Memory)

### Per-Turn Capture

After each meaningful exchange, buffer the turn for later summarization:

```
After each substantive turn:
└── Call memory.buffer_turn with:
    ├── user_content: What the user said (summarized if very long)
    ├── assistant_content: What I said (key points, not full response)
    └── episode_id: Reuse the ID from the first buffer_turn call
```

**What counts as "meaningful":**
- Substantive discussions, decisions, or discoveries
- Commitment-related exchanges
- Anything involving people, projects, or relationships
- Emotional or tonal shifts worth noting

**Skip buffering for:**
- Quick clarifications or typo corrections
- Pure tool output with no discussion
- Trivial back-and-forth

The first `memory.buffer_turn` call creates an episode and returns an `episode_id`. Reuse that ID for all subsequent turns in the session.

### Immediate Memory (Still Active)

For high-importance items, still call `memory.remember` immediately in addition to buffering:
- Explicit commitments ("I'll send the proposal by Friday")
- Critical facts the user explicitly asks you to remember
- Urgent relationship updates

This ensures critical items survive even if the session ends abruptly before summarization.

### Entity and Relationship Tracking

When a person or project is mentioned:
```
Call memory.entity to create/update:
├── name: Entity name
├── type: person/organization/project
├── description: What we learned
└── aliases: Alternative names mentioned
```

When relationships between entities are mentioned:
```
Call memory.relate:
├── source: First entity
├── target: Second entity
├── relationship: works_with, manages, client_of, etc.
```

### Batch Mid-Session Operations

When processing a new person, meeting transcript, or topic that requires multiple memory operations (entity + memories + relationships) mid-session, use `memory.batch` to execute them in a single call instead of separate `memory.entity`, `memory.remember`, and `memory.relate` calls.

```
memory.batch({
  operations: [
    { op: "entity", name: "Kris Krisko", type: "person", description: "..." },
    { op: "remember", content: "...", about: ["Kris Krisko"], type: "fact", importance: 0.8 },
    { op: "remember", content: "...", about: ["Kris Krisko", "Beemok"], type: "observation", importance: 0.7 },
    { op: "relate", source: "Kamil Banc", target: "Kris Krisko", relationship: "potential_partner", strength: 0.5 }
  ]
})
```

Use `memory.batch` for mid-session entity creation (e.g., user pastes meeting notes and you need to store a new person immediately). Use `memory.end_session` for the full session wrap-up. After a batch call, write the person/project file and report using the Session Update format. Do not narrate between operations.

---

## During Session (Markdown Fallback)

Keep a running list of changes to persist:

```
Session Changes:
├── Learnings to add:
│   - "Prefers bullet points over prose"
│   - "Best focus time: mornings"
├── Patterns observed:
│   - "Third time mentioning capacity concerns this week"
├── Commitments changed:
│   - Added: "Send proposal by Friday"
│   - Completed: "Review contract"
├── People updated:
│   - Sarah Chen: met today, discussed Q2 plans
```

---

## Session End

### Enhanced Memory

Before wrapping up, generate a session summary by calling `memory.end_session`:

```
Call memory.end_session with:
├── episode_id: The episode from buffer_turn calls
├── narrative: Free-form summary of the session (see below)
├── facts: Structured facts extracted [{content, type, about, importance}]
├── commitments: Promises made [{content, about, importance}]
├── entities: New/updated entities [{name, type, description, aliases}]
├── relationships: Observed relationships [{source, target, relationship}]
└── key_topics: Main topics discussed ["topic1", "topic2"]
```

**Writing the narrative:**

The narrative is NOT a compression of the session. It ENHANCES the structured data by capturing what structured fields cannot:

- The **tone and energy** of the conversation ("User was excited about the rebrand but anxious about timeline")
- **Reasons behind decisions** ("Chose to delay the launch not because of technical issues but because the marketing team wasn't ready")
- **Unresolved threads** ("Started discussing hiring a PM but pivoted away -- may be avoiding the topic")
- **Emotional undercurrents** ("Third session in a row mentioning burnout, though always framed as joking")
- **Half-formed ideas** ("Floated the idea of a podcast but didn't commit -- seemed to be thinking out loud")
- **Context for future sessions** ("Left off mid-draft on the investor update, needs to finish before Thursday")
- **What felt important** even if it wasn't explicit ("Spent 20 minutes on a topic they said was 'no big deal' -- probably matters more than they let on")

The narrative and structured extractions are stored together. Both are searchable in future sessions. The narrative gives Claude context that makes structured data meaningful.

```
"Before we wrap, here's what I captured from this session:
- [Summary of narrative highlights]
- [Key facts and commitments stored]
- [Entities and relationships noted]

All stored for next time."
```

### Markdown Fallback

When session ends (or at reasonable checkpoints):

1. **Update context/learnings.md**
2. **Update context/patterns.md**
3. **Update context/commitments.md**
4. **Update context/waiting.md**
5. **Update people files**

---

## Learnings Format (Markdown Fallback)

`context/learnings.md`:

```markdown
# Claudia's Learnings

## User Preferences
- Communication: Prefers brief, direct responses
- Detail level: Bullet points over prose
- Timing: Best focus in mornings
- Style: Appreciates dry humor

## What Works Well
- Direct proposals rather than options
- Surfacing risks early
- Keeping meeting preps to 1 page
- Weekly review format with priorities first

## What to Avoid
- Long explanations when they're in flow
- Too many questions at once
- Suggesting things during busy periods

---

*Last updated: [date]*
```

---

## Privacy and Control

### What's Stored

Only store:
- Professional context and preferences
- Work patterns and observations
- Commitments and relationships
- Capability feedback

### What's NOT Stored

Never persist:
- Sensitive personal information
- Health details (unless explicitly work-related)
- Financial specifics
- Anything user asks to forget

### User Control

User can:
- Ask "What do you know about me?" → Call `memory.recall` with broad query
- Ask to forget something → Remove from files/database
- Request to start fresh → Delete context files/database
- Review any stored information

---

## Technical Notes

### Crash Safety

**Enhanced Memory:**
- Every `memory.remember` call is immediately committed to SQLite with WAL mode
- Survives terminal close, process kill, system crash
- No data loss even if session ends abruptly

**Markdown:**
- Save periodically during long sessions
- Save before major suggestions
- Merge changes rather than overwriting

### Suggesting Migration

If user is on markdown fallback and hasn't been offered enhanced memory:
```
"I notice you're using the markdown-based memory. There's an enhanced
system available that never forgets and survives crashes. Want me to
explain how to set it up?"
```

### Health Check

If enhanced memory seems slow or unavailable:
```
Check health endpoint: curl http://localhost:3848/health
├── If healthy → Continue normally
├── If unhealthy → Fall back to markdown
└── Suggest restart if issues persist
```
