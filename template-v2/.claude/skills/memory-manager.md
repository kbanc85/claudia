---
name: memory-manager
description: Handle cross-session persistence using the enhanced memory system (MCP) with fallback to markdown files.
user-invocable: false
effort-level: medium
---

# Memory Manager Skill

**Triggers:** Session start (load) and session end (save).

---

## MCP Tool Reference

All available memory tools when the daemon is connected. Skills should only reference tools from this list.

### Core
`memory.remember`, `memory.recall`, `memory.about`, `memory.entity`, `memory.relate`, `memory.search_entities`, `memory.batch`

### Session Lifecycle
`memory.session_context`, `memory.buffer_turn`, `memory.end_session`, `memory.unsummarized`, `memory.briefing`

### Documents & Files
`memory.file`, `memory.documents`

### Analysis & Insights
`memory.predictions`, `memory.prediction_feedback`, `memory.morning_context`, `memory.consolidate`, `memory.reflections`

### Trust & Provenance
`memory.trace`, `memory.correct`, `memory.invalidate`, `memory.audit_history`, `memory.merge_entities`, `memory.delete_entity`

### Network Graph
`memory.project_network`, `memory.find_path`, `memory.network_hubs`, `memory.dormant_relationships`

### Agent Dispatch
`memory.agent_dispatch`

### Gateway
`memory.telegram_inbox`

### Admin
`memory.purge`

---

## Hard Requirements

These are non-negotiable. Violating them defeats the purpose of the memory system.

### 1. Source Preservation is MANDATORY

When processing source material (transcripts, emails, documents):

**STOP. Check for duplicates, then file it FIRST.**

```
User shares transcript/email/document
         ↓
    ┌─────────────────────────────────┐
    │  1. CHECK for duplicates first  │
    │     (by source_type + source_ref)│
    │  2. If new: CALL memory.file    │
    │     with the FULL raw content   │
    │  3. ASK user about extraction   │
    │     (don't auto-extract)        │
    └─────────────────────────────────┘
         ↓
    If user says "extract now":
         ↓
    Extract and present for verification
         ↓
    Store verified memories/entities
```

**If you find yourself reading multiple source documents** without calling `memory.file` for each one, **STOP and fix it**. Go back and file each source before continuing.

**If you find yourself auto-extracting without asking**, **STOP**. File first, then ask if the user wants extraction now or later. This keeps you responsive during long documents.

### 2. Verify Memory Tools at Session Start

Before greeting the user:
1. Check that `memory.*` tools are in your available tools
2. If missing: Warn user "Memory daemon not connected. Run /diagnose."
3. Call `memory.session_context` to load context
4. If this fails: Warn user about degraded mode

### 3. Buffer Turns During Sessions

Call `memory.buffer_turn` for each meaningful exchange. This ensures nothing is lost if the session ends abruptly.

### 4. Trust North Star: Origin Tracking

Every memory must track its origin. When storing memories, set `origin_type` appropriately:

| Origin Type | When to Use | Confidence |
|-------------|-------------|------------|
| `user_stated` | User explicitly told me this | High (0.9+) |
| `extracted` | Extracted from a document, email, or transcript | Medium-High (0.7-0.9) |
| `inferred` | I deduced this from context or patterns | Medium (0.5-0.7) |
| `corrected` | User corrected a previous memory | Very High (1.0) |

When recalling information, signal confidence appropriately. See `.claude/rules/trust-north-star.md` for full guidelines.

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
2. Call memory.briefing (compact counts + highlights: commitments, cooling, unread, predictions, activity)
```

The briefing returns ~500 tokens of aggregate context. Use it to inform the greeting and surface urgent items. Pull full context on-demand via `memory.recall` / `memory.about` during conversation.

Do NOT read learnings.md, patterns.md, commitments.md, or waiting.md at startup. These duplicate what is already in the memory database. Read them on-demand only when a specific file becomes relevant during the session.

**Fallback:** If `memory.briefing` is not available (older daemon), fall back to `memory.predictions`.

### 1b. Check Telegram Inbox

After loading session context, check for new Telegram messages:

```
Session context already includes the inbox (via memory.session_context).
If unread Telegram/Slack messages are returned:
├── Summarize them to the user:
│   "You have N new messages from Telegram since we last talked: [summary]"
├── Messages are marked as read automatically, so they won't appear again
└── Mid-session: user can say "check telegram" or "any new messages?"
    to trigger another inbox check via memory.telegram_inbox
```

The `memory.session_context` call automatically includes a Telegram Inbox section when unread gateway messages exist. If the user asks "any new messages?" or "check telegram" mid-session, call `memory.telegram_inbox` directly to fetch and display any messages that arrived since session start.

If the user asks about Telegram messages but the gateway isn't running (no messages returned and no gateway process detected), suggest: "The gateway doesn't seem to be running. You can start it with `/gateway start`."

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

**Change it up frequently.** Greetings should feel natural and personal based on context.

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

### Don't Wait for Session End

Context compaction happens without warning. You're having a great conversation, learning all sorts of useful things, and then suddenly your context shrinks and everything you hadn't stored yet is gone. Poof.

So store the important stuff as it happens, not when the session wraps up.

Think of it like taking notes during a meeting versus trying to remember everything afterward. The former is reliable. The latter is how things slip through the cracks.

#### Commitments: Store Them Immediately

When someone makes a promise (the user, or someone they're telling you about), that's too important to buffer. Call `memory.remember` right away with:
- `type`: "commitment"
- `importance`: 0.9 (commitments matter)
- `about`: whoever made the promise
- `source`: "conversation"

Then add it to `context/commitments.md`. Two places is better than zero. If context compacts before session end, the memory survives. If the markdown file gets lost, the memory survives. Belt and suspenders.

#### People: The Second Mention Rule

First time a name comes up, just note it mentally. No action needed.

Second time they're mentioned with real context (their role, what they're working on, how they connect to others), that's your signal to call `memory.entity`.

A casual name-drop doesn't need a database entry. A person who matters to the conversation does.

The threshold is "meaningful context":
- Their role, job title, or position
- What they're working on, how the user knows them
- Who they work with, report to, or collaborate with

#### Relationships: Capture the Connections

When you hear language like "Sarah works with Mike" or "they're our client," capture that silently with `memory.relate`. Don't announce it, just do it. These connections are exactly what the memory system is for.

| When you hear... | Call... |
|------------------|---------|
| "X works with Y" | `memory.relate(X, Y, "works_with")` |
| "X reports to Y" | `memory.relate(X, Y, "reports_to")` |
| "X is Y's manager" | `memory.relate(Y, X, "reports_to")` |
| "X is our client" | `memory.relate(X, user_org, "client_of")` |
| "X knows Y" | `memory.relate(X, Y, "knows")` |
| "X introduced me to Y" | `memory.relate(X, Y, "introduced")` |

These relationships are the hidden structure of someone's professional life. Capture them quietly. No need to narrate.

#### Corrections Are Gold

When the user says "Actually, Sarah moved to Acme" or "No, that project got cancelled," that's a correction. Store it immediately with high importance (0.95). User corrections are authoritative and should never be lost.

Other high-importance items to store immediately (not just buffer):
- Explicit commitments with deadlines ("I'll send X by Friday")
- Strategic decisions ("We're going with option B for the launch")
- Explicit memory requests ("Remember that...", "Don't forget...")
- Contact information changes (new email, phone, address)

These bypass buffering because losing them to context compaction would be genuinely harmful.

#### If Compaction Already Happened

With the 1M context window, compaction happens less frequently, but it can still occur during very long sessions. For deep full-context analysis, consider using `/deep-context` which pulls 100-200 memories across multiple dimensions.

If you see a context compaction advisory, review what you can recover:

1. Review what remains in your context
2. Call `memory.remember` for any commitments you can piece together
3. Call `memory.entity` for people discussed in detail
4. Call `memory.relate` for relationships mentioned
5. Call `memory.buffer_turn` with a summary of recent exchanges

This is triage, not standard practice. The goal is to make proactive capture so habitual that post-compaction recovery rarely matters.

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

### Document Filing (Source Preservation)

**Critical:** When the user shares raw source material (transcripts, emails, documents), file it BEFORE or IMMEDIATELY AFTER extracting memories. This creates provenance: every fact can trace back to its source.

#### When to File

| User Action | File It? | Source Type |
|-------------|----------|-------------|
| Pastes meeting transcript | **Yes** | `transcript` |
| Shares email content to act on | **Yes** | `gmail` |
| Uploads or pastes document | **Yes** | `upload` |
| Shares research/web content | **Yes** | `capture` |
| Asks a question | No | - |
| Casual conversation | No | - |

#### How to File

```
Call memory.file with:
├── content: The full raw text (do not summarize)
├── filename: YYYY-MM-DD-[entity]-[topic].md (e.g., "2026-02-04-sarah-chen-kickoff.md")
├── source_type: "transcript", "gmail", "upload", or "capture"
├── summary: One-line description of what this is
├── about: [list of entity names mentioned]
└── memory_ids: [list of memory IDs if you already extracted memories]
```

#### The Filing Flow

1. **Check for duplicates first**
   - If source has an identifiable ID (email message-id, URL, file hash):
   - Query documents: `SELECT * FROM documents WHERE source_type = ? AND source_ref = ?`
   - If found: "I already have this filed at [path]. Want me to pull up what I extracted?"
   - If not found: Continue to step 2

2. **File immediately** using `memory.file` with full content
   - Do NOT automatically extract in the same turn

3. **Ask about extraction**
   - "Filed at people/sarah-chen/transcripts/2026-02-04-kickoff.md"
   - "Want me to extract the people, relationships, and commitments now, or later?"

4. **If user says "now" or "yes, extract"**
   - Read the filed document
   - Extract entities (people mentioned)
   - Extract relationships (how they're connected)
   - Extract commitments (promises made)
   - Present findings for user verification before storing
   - Store verified info via memory.batch

5. **If user says "later"**
   - Done. User can ask "extract that transcript" anytime later

#### Why Not Auto-Extract?

- **Accuracy**: User verifies "Sarah and Jim are colleagues" (not competitors)
- **Responsiveness**: Claudia stays available for conversation
- **Focus**: Extraction targets relationships and commitments (Claudia's mission)
- **Control**: User decides when to invest time in extraction

#### Duplicate Detection

Before filing any source with an external identifier:

| Source Type | Identifier to Check |
|-------------|---------------------|
| Gmail | Message-ID header |
| Transcript | File path or content hash |
| Upload | Filename + size, or content hash |
| URL/Capture | URL |

Query pattern:
```python
existing = db.get_one(
    "documents",
    where="source_type = ? AND source_ref = ?",
    where_params=(source_type, source_identifier)
)
```

If exists, surface it: "I filed this on [date]. Summary: [summary]. Want me to show what I extracted?"

#### Example: Transcript Processing

```
User: "Here's the transcript from my call with Sarah Chen about the rebrand project"

1. Check if this transcript was filed before (by content hash or filename)

2. Call memory.file:
   - content: [full transcript text]
   - filename: "2026-02-04-sarah-chen-rebrand.md"
   - source_type: "transcript"
   - summary: "Call with Sarah Chen re: rebrand project kickoff"
   - about: ["Sarah Chen", "Rebrand Project"]

3. Ask: "Filed. Want me to extract people, relationships, and commitments now?"

4. If user says yes:
   - Extract and present findings for verification
   - Store verified info via memory.batch
   - Update people/sarah-chen.md with new context

5. Report using Session Update format
```

#### Example: Email Processing

```
User: "Here's an email from Jim about the partnership. I need to respond."

1. Check if this email was filed before (by Message-ID header if available)

2. Call memory.file:
   - content: [full email text]
   - filename: "2026-02-04-jim-partnership.md"
   - source_type: "gmail"
   - source_ref: "<message-id@example.com>" (if available)
   - summary: "Jim Ferry re: partnership terms"
   - about: ["Jim Ferry"]

3. Since user needs to respond, help draft the reply immediately
   - Extraction can happen after the reply is sent
   - Or user can say "extract this too" and we do both

4. The email is now filed and searchable
```

#### Why This Matters

- User can ask "where did you learn that?" and you can cite the source
- Original context preserved for later human review
- Facts can be verified against source material
- Nothing important lives only in conversation context (which compresses away)
- Long documents don't block Claudia from being responsive

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
├── key_topics: Main topics discussed ["topic1", "topic2"]
└── reflections: Learnings about working with this user (see /meditate skill)
    [{content, type: observation|pattern|learning|question, about?}]
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

## Reflections (Enhanced Memory)

Reflections are persistent learnings about working with this user. Unlike memories (facts about the world), reflections capture communication preferences, work patterns, and how to be more helpful.

### What Are Reflections

| Type | Purpose | Example |
|------|---------|---------|
| `observation` | User behavior noticed | "Prefers bullet points over paragraphs" |
| `pattern` | Recurring theme | "Mondays involve financial review" |
| `learning` | How to work better | "Direct questions get better responses" |
| `question` | Worth revisiting | "How did the Acme negotiation resolve?" |

### Applying Reflections at Session Start

When `memory.session_context` or `memory.briefing` returns active reflections, **apply them silently**:

| Reflection Type | How to Apply |
|-----------------|--------------|
| `observation` | Adjust format/style without announcing it |
| `pattern` | Be aware of recurring themes, anticipate needs |
| `learning` | Modify your approach based on what works |
| `question` | Keep in mind for relevant moments |

**Do NOT announce reflections.** They inform behavior invisibly. For example:
- If a reflection says "Prefers bullet points over prose," use bullet points without saying "I'm using bullets because you prefer them."
- If a reflection says "Best focus time is mornings," don't schedule check-ins for afternoons.

**Exception:** If the user explicitly asks "show me your reflections" or "what have you learned about me?", then surface them using `memory.reflections`.

User can toggle: "be explicit about reflections" switches to explicit mode where you announce what you're applying.

### Generating Reflections

Reflections are typically generated via the `/meditate` skill at session end, but can be created anytime:

```
1. User says "let's wrap up" or "/meditate"
2. Review the session and identify 1-3 insights
3. Present to user for approval
4. Store via memory.end_session with reflections array
```

### Retrieving Reflections

When user asks about what you've learned:

```
"What have you learned about me?"
"Show me your reflections"
"Any observations about how I work?"

→ Call memory.reflections (action: "get", limit: 20)
→ Format nicely, grouped by type
→ Mention timeline (first observed, times confirmed)
```

### Editing Reflections

Users can modify reflections via natural language:

```
User: "That thing about me preferring bullet points - that's only for technical content."

1. Call memory.reflections (action: "search", query: "bullet points")
2. Find the relevant reflection
3. Call memory.reflections (action: "update", reflection_id: X, content: "...")
4. Confirm: "Updated. I'll keep that distinction in mind."
```

```
User: "Delete the reflection about Monday mornings"

1. Search for the reflection
2. Call memory.reflections (action: "delete", reflection_id: X)
3. Confirm: "Done, I've removed that."
```

### How Reflections Surface

Reflections are loaded automatically via `memory.session_context` or `memory.briefing` and inform:
- Communication style (don't announce, just apply)
- When to surface vs stay silent
- How to format output
- What questions to ask

### Reflection Decay

Reflections decay very slowly (0.999 daily, ~2 year half-life) because they're user-approved. Well-confirmed reflections (3+ times) decay even slower (0.9995).

### Without Enhanced Memory

When the memory daemon is unavailable, reflections are stored in `context/learnings.md` under a "Reflections" heading.

---

## User Corrections

Users can correct mistakes in the memory system through natural language. User corrections are **authoritative**: never argue about what you remember.

### Correction Triggers

| User Says | Intent | Action |
|-----------|--------|--------|
| "That's not right" | Incorrect fact | Correct or invalidate |
| "Actually, [correct info]" | Update needed | Correct the memory |
| "That's not true anymore" | Outdated | Invalidate |
| "Delete that memory" | Remove | Soft-delete |
| "Forget about X" | Remove context | Invalidate related memories |
| "You're wrong about [person]" | Fix entity info | Update entity or correct memories |

### Correction Flow

1. **Acknowledge immediately**: "Let me fix that."
2. **Search for the memory**: Use `memory.recall` with the topic
3. **Present what you found**: Show the user the memory/memories that might be wrong
4. **Offer options**:
   - **Correct**: Update the content, keep the history (use `memory.correct`)
   - **Invalidate**: Mark as no longer true (use `memory.invalidate`)
   - **No change**: User clarifies it's actually correct
5. **Confirm action**: "Fixed. I've updated [brief description]."

### Examples

**Correcting a fact:**
```
User: "Actually, Sarah works at Acme now, not TechCorp"

1. Search: memory.recall("Sarah works TechCorp")
2. Show: "I have a memory that 'Sarah Chen works at TechCorp'. Is this the one?"
3. User confirms
4. Call: memory.correct(memory_id=42,
                        correction="Sarah Chen works at Acme",
                        reason="User correction: moved companies")
5. Respond: "Updated. I now know Sarah works at Acme."
```

**Invalidating outdated info:**
```
User: "That project is cancelled, don't remind me about it"

1. Search: memory.recall("project [name]")
2. Show: "I have 5 memories about [project]. Want me to mark them all as no longer relevant?"
3. User confirms
4. Call: memory.invalidate for each, with reason="Project cancelled"
5. Respond: "Done. I won't surface those memories anymore."
```

**Merging duplicate people:**
```
User: "John Smith and Jon Smith are the same person"

1. Search for both entities
2. Confirm: "I found both. Jon Smith has fewer memories. Should I merge Jon into John?"
3. User confirms
4. Call: memory.merge_entities(source_id=87, target_id=42, reason="User confirmed same person")
5. Respond: "Merged. All memories about Jon are now linked to John Smith."
```

### Principles

- **Never argue**: If the user says something is wrong, it's wrong
- **Preserve history**: Use correct/invalidate rather than hard delete when possible
- **Confirm before acting**: Show what will change before changing it
- **Be grateful**: User corrections improve the memory system
- **Learn from corrections**: High correction rates for an entity might mean the source data was poor
- **Trust North Star**: Corrections automatically set `origin_type` to "corrected" and `confidence` to 1.0, making them authoritative

### When Corrections Cascade

Some corrections affect multiple things:
- Correcting a person's role might affect relationship descriptions
- Invalidating a project might make related commitments irrelevant
- Merging entities consolidates all their memories

When you detect cascade effects, surface them: "This will also affect 3 related memories. Want me to update those too?"

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
