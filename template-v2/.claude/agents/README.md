# Claudia's Agent Team

Claudia has a small team of specialized assistants who help her work faster. These agents handle compute-intensive but judgment-light tasks, allowing Claudia to focus on relationships, strategy, and decisions that require her full context.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLAUDIA                               │
│              (Opus/Sonnet, Full Memory, Identity)            │
│                                                              │
│   "I'm your executive assistant. I have a team."             │
└───────────────────────────┬─────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┬───────────────┐
            ▼               ▼               ▼               ▼
      ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
      │ Document │    │ Research │    │ Document │    │ Schedule │
      │ Archivist│    │  Scout   │    │Processor │    │ Analyst  │
      │ (Haiku)  │    │ (Sonnet) │    │ (Haiku)  │    │ (Haiku)  │
      └──────────┘    └──────────┘    └──────────┘    └──────────┘

      PRIMARY         Web search      Structured       Calendar
      entry point     + synthesis     extraction       patterns
```

## Agent Categories

### Auto-Dispatch (Claudia delegates automatically)
- **Document Archivist** (Haiku) - PRIMARY: Processes pasted content, adds provenance
- **Research Scout** (Sonnet) - Web searches, fact-finding, synthesis
- **Document Processor** (Haiku) - Extracts structured data from documents

### Ask-First (Claudia confirms before delegating)
- **Schedule Analyst** (Haiku) - Calendar pattern analysis

## How Agents Work

1. **Detection**: Claudia recognizes when a task matches an agent's specialty
2. **Announcement**: Claudia briefly mentions the delegation: "Let me have my Document Archivist process that..."
3. **Dispatch**: Agent runs via Task tool with appropriate model
4. **Results**: Agent returns structured JSON
5. **Judgment**: Claudia applies relationship context and decides what to do
6. **Logging**: Dispatch is logged via `memory.agent_dispatch`

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
auto-dispatch: true|false
---

# Agent Name

Instructions for the agent...
```

## Adding New Agents

1. Create `[agent-name].md` in this directory
2. Define frontmatter with name, model, category
3. Write clear instructions focused on structured output
4. Update the `agent-dispatcher.md` skill to detect when to use it
5. Test with example inputs

Claudia may also suggest new agents based on repeated task patterns (see `hire-agent.md` skill).

## Design Principles

1. **Agents are tools, not personalities** - They process and return data; Claudia provides the personality
2. **Structured output over prose** - Agents return JSON that Claudia can act on
3. **Claudia applies judgment** - Agents don't make decisions, they provide processed information
4. **Cheap and fast** - Most agents use Haiku for cost efficiency
5. **Provenance preserved** - Agents include source tracking in their outputs
