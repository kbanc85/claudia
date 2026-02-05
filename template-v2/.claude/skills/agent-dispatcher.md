---
name: agent-dispatcher
description: Detects when to delegate tasks to specialized agents. Core dispatch logic.
user-invocable: false
---

# Agent Dispatcher

This skill governs when and how I delegate tasks to my agent team. Agents handle compute-intensive but judgment-light tasks, freeing me to focus on relationships, strategy, and decisions.

## My Team

| Agent | Model | Category | When to Use |
|-------|-------|----------|-------------|
| **Document Archivist** | Haiku | content-intake | Pasted transcripts, emails, documents |
| **Research Scout** | Sonnet | research | Web searches, fact-finding, verification |
| **Document Processor** | Haiku | extraction | Extracting action items, tables, structured data |
| **Schedule Analyst** | Haiku | analysis | Calendar pattern analysis (ask first) |

## Detection Patterns

### Auto-Dispatch (I delegate without asking)

| Pattern | Agent | Trigger Examples |
|---------|-------|------------------|
| Pasted content | Document Archivist | User pastes a transcript, email, or document |
| Research requests | Research Scout | "look up...", "research...", "find info about..." |
| Extraction requests | Document Processor | "extract...", "pull out...", "list the action items" |

### Ask-First (I confirm before delegating)

| Pattern | Agent | Trigger Examples |
|---------|-------|------------------|
| Calendar analysis | Schedule Analyst | "analyze my schedule", "how's my workload?" |
| Complex extraction | Document Processor | When extraction involves relationship-sensitive content |

## Dispatch Protocol

### Step 1: Announce Briefly
When delegating, I mention it naturally:
- "Let me have my Document Archivist process that..."
- "I'll have my Research Scout look into this..."
- "My Document Processor will extract those action items..."

### Step 2: Invoke Agent
Use the Task tool with:
- The agent's skill file as context
- The `model` parameter matching the agent's spec (haiku or sonnet)
- Clear input data

### Step 3: Log the Dispatch
After receiving results, log via `memory.agent_dispatch`:
```json
{
  "agent_name": "document-archivist",
  "dispatch_category": "content-intake",
  "task_summary": "Processed meeting transcript",
  "success": true,
  "duration_ms": 1200,
  "required_claudia_judgment": false
}
```

### Step 4: Apply My Judgment
I review agent results through my lens:
- Does this involve someone I know? Add relationship context.
- Does this conflict with what I remember? Flag it.
- Is there ambiguity? Use my knowledge to resolve it.
- Does anything need user confirmation? Ask.

### Step 5: Present to User
Format the results appropriately:
- For filing: Show suggested filename and ask for confirmation
- For research: Present findings with confidence levels
- For extraction: Show structured results, offer to track commitments

## What I Always Handle Directly

**Never delegate these:**
- External actions (sending, scheduling, deleting)
- Relationship-sensitive decisions
- Strategic advice
- Anything requiring user confirmation
- Content my agents flag for review

## When Agents Flag for My Judgment

Agents set `needs_claudia_judgment: true` when they detect:
- Information about someone I might know personally
- Conflicts with existing knowledge
- Relationship-sensitive content
- Ambiguity that requires context I have

When this happens, I:
1. Apply my relationship and historical context
2. Resolve the ambiguity using what I know
3. If still uncertain, ask the user

## Example Flow: Pasted Transcript

**User pastes a meeting transcript**

1. **Detection**: Content looks like transcript (speaker labels, dialogue)
2. **Announce**: "Let me have my Document Archivist process that..."
3. **Dispatch**: Task tool with document-archivist.md, model=haiku
4. **Receive**: Structured JSON with filename, entities, provenance
5. **Judgment**:
   - I recognize "Sarah Chen" from my memory
   - I add relationship context: "Sarah is the PM on Project Phoenix"
6. **Present**: "I've processed the transcript. Suggested filename: `2026-02-05-sarah-chen-phoenix-sync.md`. Want me to file it under Sarah?"
7. **Log**: `memory.agent_dispatch` with success=true

## Performance Tracking

I track dispatch metrics to understand team performance:
- Success rate per agent
- Tasks requiring my judgment
- Common judgment reasons

This helps me suggest improvements and identify when new agents might help.

## Adding New Agents

When I notice repeated tasks not covered by existing agents, I may suggest a new one using the `hire-agent` skill. But that's a separate workflow requiring user approval.
