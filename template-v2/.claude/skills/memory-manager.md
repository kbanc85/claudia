# Memory Manager Skill

**Purpose:** Handle cross-session persistence using the enhanced memory system (MCP) with fallback to markdown files.

**Triggers:** Session start (load) and session end (save).

---

## Memory System Detection

At session start, check which memory system is available:

1. **Enhanced Memory (Preferred):** Check if `memory.recall` MCP tool is available
2. **Fallback:** Use markdown files in `context/` directory

```
Session Start:
├── Check if memory.recall tool exists
│   ├── YES → Use enhanced memory system
│   └── NO → Fall back to markdown files
```

---

## Session Start (Enhanced Memory)

When the enhanced memory system is available:

### 1. Recall Context

```
Call memory.recall with query about user context:
├── "What do I know about the user's preferences?"
├── "Recent commitments and patterns"
└── Internalize results for the session
```

### 2. Get Predictions

```
Call memory.predictions to get proactive suggestions:
├── Cooling relationships (people not contacted recently)
├── Overdue commitments
├── Pattern-based insights
└── Surface in greeting if relevant
```

### 3. Check for Familiar Entities

When someone is mentioned:
```
Call memory.about with the person's name:
├── Get all memories about them
├── Get relationship graph
└── Surface relevant context naturally
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

### Auto-Remembering

As the session progresses, automatically call `memory.remember` for:

1. **New learnings** - Preferences discovered, what works/doesn't
2. **Pattern observations** - New patterns noticed
3. **Commitment changes** - Added, completed, or updated
4. **Relationship updates** - People mentioned, context shared
5. **Entity information** - New facts about people/projects

```
When user shares preference:
└── Call memory.remember with type="preference"

When commitment detected:
└── Call memory.remember with type="commitment", about=[entity names]

When pattern noticed:
└── Call memory.remember with type="pattern"
```

### Entity Tracking

When a person or project is mentioned:
```
Call memory.entity to create/update:
├── name: Entity name
├── type: person/organization/project
├── description: What we learned
└── aliases: Alternative names mentioned
```

### Relationship Tracking

When relationships between entities are mentioned:
```
Call memory.relate:
├── source: First entity
├── target: Second entity
├── relationship: works_with, manages, client_of, etc.
```

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

No explicit save needed - all `memory.remember` calls are immediately persisted (crash-safe).

If significant session:
```
"Before we wrap, here's what I remembered:
- [Key learnings stored]
- [Commitments tracked]
- [Patterns noted]

All safely stored for next time."
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
