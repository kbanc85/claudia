# Claudia's Agent Team

Claudia has a small team of specialized assistants who help her work faster. These agents handle compute-intensive but judgment-light tasks, allowing Claudia to focus on relationships, strategy, and decisions that require her full context.

## Two-Tier Architecture

Claudia dispatches agents using two mechanisms, matched to each agent's needs:

```
┌─────────────────────────────────────────────────────────────┐
│                        CLAUDIA                               │
│              (Team Lead, Full Memory, Identity)              │
│                                                              │
│   "I'm your executive assistant. I have a team."             │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
   Tier 1: Task Tool                    Tier 2: Native Team
   (fast, structured)                   (independent context)
        │                                       │
   ┌────┴────────┬────────────┐           ┌─────┴──────┐
   │  Document   │  Document  │           │  Research   │
   │  Archivist  │  Processor │           │   Scout     │
   │  (Haiku)    │  (Haiku)   │           │  (Sonnet)   │
   └─────────────┴────────────┘           └────────────┘
   │  Schedule   │
   │  Analyst    │
   │  (Haiku)    │
   └─────────────┘
```

### Tier 1: Task Tool

Fast, structured dispatch via Claude Code's Task tool. Best for agents that take structured input and return structured output without needing independent tool access.

- **Document Archivist** (Haiku) - PRIMARY: Processes pasted content, adds provenance
- **Document Processor** (Haiku) - Extracts structured data from documents
- **Schedule Analyst** (Haiku) - Calendar pattern analysis (ask-first)

### Tier 2: Native Agent Team

Independent agents spawned as native teammates. They get their own context window, tool access, and multi-turn execution. Best for complex tasks requiring autonomous research.

- **Research Scout** (Sonnet) - Web searches, fact-finding, synthesis

Claudia provides a briefing packet to Tier 2 agents so they have the context they need without direct access to her memory.

## How Agents Work

1. **Detection**: Claudia recognizes when a task matches an agent's specialty
2. **Announcement**: Claudia briefly mentions the delegation
3. **Dispatch**:
   - Tier 1: Task tool with agent definition, `model: haiku`
   - Tier 2: Native teammate with briefing packet
4. **Results**: Agent returns structured JSON
5. **Judgment**: Claudia applies relationship context and decides what to do

## What Claudia Always Handles Directly

- External actions (sending, scheduling, deleting)
- Relationship-sensitive content
- Strategic decisions
- Anything requiring user confirmation
- Content the agents flag for review

## Agent Definition Format

Each agent is defined in a markdown file with YAML frontmatter:

```yaml
---
name: agent-name
description: What this agent does
model: haiku|sonnet
dispatch-category: content-intake|research|extraction|analysis
dispatch-tier: task|native_team
auto-dispatch: true|false
---

# Agent Name

Instructions for the agent...
```

## Adding New Agents

1. Create `[agent-name].md` in this directory
2. Define frontmatter with name, model, category, and dispatch-tier
3. Write clear instructions focused on structured output
4. Update the `agent-dispatcher.md` skill to detect when to use it
5. Test with example inputs

Most new agents should be Tier 1 (Task tool) unless they genuinely need independent context, multi-turn execution, or their own tool access.

Claudia may also suggest new agents based on repeated task patterns (see `hire-agent.md` skill).

## Design Principles

1. **Agents are tools, not personalities** - They process and return data; Claudia provides the personality
2. **Structured output over prose** - Agents return JSON that Claudia can act on
3. **Claudia applies judgment** - Agents don't make decisions, they provide processed information
4. **Right tier for the job** - Tier 1 for structured processing, Tier 2 for autonomous research
5. **Provenance preserved** - Agents include source tracking in their outputs
6. **Claudia is always team lead** - She maintains identity, memory, and judgment across all dispatches
