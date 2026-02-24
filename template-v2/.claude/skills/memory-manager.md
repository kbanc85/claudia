---
name: memory-manager
description: Handle cross-session persistence using the enhanced memory system (MCP) with fallback to markdown files.
user-invocable: false
effort-level: medium
---

# Memory Manager Skill

**Triggers:** Session start (load) and session end (save).

---

## Hard Requirements

These are non-negotiable. Violating them defeats the purpose of the memory system.

### 1. Source Preservation is MANDATORY

When processing source material (transcripts, emails, documents):

1. **Check for duplicates** (by source_type + source_ref)
2. **File it first** via `memory.document` (operation: "store") with full raw content
3. **Ask user about extraction** (don't auto-extract)
4. If user says extract: use Document Processor agent (Haiku) for longer content, or extract manually for short notes. Review agent output before storing via `memory.batch`.

**If you find yourself reading source documents** without calling `memory.document` (operation: "store") for each one, **STOP and fix it**. File first, then ask if extraction should happen now or later.

### 2. Verify Memory Tools at Session Start

Before greeting, check that `memory.*` tools are in your available tools. If missing, follow the `memory-availability` rule (never silently fall back).

### 3. Buffer Turns During Sessions

Call `memory.session` (operation: "buffer") for each meaningful exchange. This ensures nothing is lost if the session ends abruptly.

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

Call `memory.session` (operation: "unsummarized"). For each result, review buffered turns, write a retroactive narrative, extract structured facts/commitments/entities, and call `memory.end_session` to finalize. Note in the narrative that it was "Reconstructed from N buffered turns from [date]".

### 1. Minimal Startup (2 calls max)

1. Read `context/me.md` (for greeting personalization)
2. Call `memory.briefing` (~500 tokens of aggregate context: commitments, cooling, unread, predictions)

Pull full context on-demand via `memory.recall` / `memory.about` during conversation. Do NOT read learnings.md, patterns.md, commitments.md, or waiting.md at startup (they duplicate the memory database).

**Fallback:** If `memory.briefing` unavailable, use `memory.temporal` (operation: "morning").

### 2. Session Start (Markdown Fallback)

If enhanced memory is unavailable, read: `context/me.md`, `context/learnings.md`, `context/patterns.md`, `context/commitments.md`, `context/waiting.md`.

---

## During Session (Enhanced Memory)

### Per-Turn Capture

After each meaningful exchange, buffer the turn for later summarization:

```
After each substantive turn:
└── Call memory.session (operation: "buffer") with:
    ├── user_content: What the user said (summarized if very long)
    ├── assistant_content: What I said (key points, not full response)
    └── episode_id: Reuse the ID from the first buffer call
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

The first `memory.session` (operation: "buffer") call creates an episode and returns an `episode_id`. Reuse that ID for all subsequent turns in the session.

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

Second time they're mentioned with real context (their role, what they're working on, how they connect to others), that's your signal to call `memory.entities` (operation: "create").

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
3. Call `memory.entities` (operation: "create") for people discussed in detail
4. Call `memory.relate` for relationships mentioned
5. Call `memory.session` (operation: "buffer") with a summary of recent exchanges

This is triage, not standard practice. The goal is to make proactive capture so habitual that post-compaction recovery rarely matters.

### Entity and Relationship Tracking

When a person or project is mentioned:
```
Call memory.entities (operation: "create") to create/update:
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

When processing a new person, meeting transcript, or topic that requires multiple memory operations (entity + memories + relationships) mid-session, use `memory.batch` to execute them in a single call instead of separate `memory.entities`, `memory.remember`, and `memory.relate` calls.

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
Call memory.document (operation: "store") with:
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

2. **File immediately** using `memory.document` (operation: "store") with full content
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

#### Why This Matters

Every fact traces back to its source. User can always ask "where did you learn that?" and get a citation. Nothing important lives only in conversation context.

---

## Session End

### Enhanced Memory

Before wrapping up, generate a session summary by calling `memory.end_session`:

```
Call memory.end_session with:
├── episode_id: The episode from session buffer calls
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

## Reflections (Enhanced Memory)

Reflections are persistent learnings about working with this user. Unlike memories (facts about the world), reflections capture communication preferences, work patterns, and how to be more helpful.

### What Are Reflections

| Type | Purpose | Example |
|------|---------|---------|
| `observation` | User behavior noticed | "Prefers bullet points over paragraphs" |
| `pattern` | Recurring theme | "Mondays involve financial review" |
| `learning` | How to work better | "Direct questions get better responses" |
| `question` | Worth revisiting | "How did the Acme negotiation resolve?" |

### Applying Reflections

When `memory.briefing` returns active reflections, **apply them silently**. Do NOT announce reflections. They inform behavior invisibly (adjust format/style, anticipate needs).

**Exception:** Surface reflections if the user explicitly asks ("show me your reflections" / "what have you learned?") via `memory.reflections`.

### Managing Reflections

- **Generate** via `/meditate` skill at session end, or anytime via `memory.end_session` with reflections array
- **Retrieve** via `memory.reflections` (action: "get")
- **Edit/Delete** via `memory.reflections` (action: "update"/"delete") when user requests changes
- **Decay** is very slow (~2 year half-life). Well-confirmed reflections (3+) decay even slower.
- **Without daemon** reflections go to `context/learnings.md` under a "Reflections" heading.

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
   - **Correct**: Update the content, keep the history (use `memory.modify`, operation: "correct")
   - **Invalidate**: Mark as no longer true (use `memory.modify`, operation: "invalidate")
   - **No change**: User clarifies it's actually correct
5. **Confirm action**: "Fixed. I've updated [brief description]."

### Examples

**Correcting a fact:**
```
User: "Actually, Sarah works at Acme now, not TechCorp"

1. Search: memory.recall("Sarah works TechCorp")
2. Show: "I have a memory that 'Sarah Chen works at TechCorp'. Is this the one?"
3. User confirms
4. Call: memory.modify(operation="correct", memory_id=42,
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
4. Call: memory.modify (operation: "invalidate") for each, with reason="Project cancelled"
5. Respond: "Done. I won't surface those memories anymore."
```

**Merging duplicate people:**
```
User: "John Smith and Jon Smith are the same person"

1. Search for both entities
2. Confirm: "I found both. Jon Smith has fewer memories. Should I merge Jon into John?"
3. User confirms
4. Call: memory.entities(operation="merge", source_id=87, target_id=42, reason="User confirmed same person")
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

### Health Check

If enhanced memory seems slow or unavailable, check `curl http://localhost:3848/health`. If unhealthy, fall back to markdown and suggest `/diagnose`.
