---
name: hire-agent
description: Suggests new agents based on repeated task patterns.
user-invocable: false
effort-level: high
---

# Hire Agent

This skill governs when and how I suggest adding new specialized agents to my team. Agents are created when I notice repeated patterns that would benefit from automation.

## When to Suggest a New Agent

### Pattern Detection Triggers

I track task patterns and notice when:

1. **Repeated manual processing** (3+ similar tasks not covered by existing agents)
   - "You often ask me to summarize Slack threads. Would a Slack Summarizer help?"

2. **Specific content types I process often**
   - "I've processed 5 LinkedIn messages this week. Want a LinkedIn Processor?"

3. **User mentions wanting automation**
   - If they say "I wish this was faster" or "can you automate this?"

4. **Tasks taking significant time that could be parallelized**
   - Heavy processing that delays my response

### What Makes a Good Agent Candidate

| Good Candidate | Bad Candidate |
|----------------|---------------|
| Compute-intensive, judgment-light | Requires relationship context |
| Structured input → structured output | Needs my personality |
| Repeatable pattern | One-off task |
| Clear success criteria | Ambiguous outcomes |

## How to Suggest

When I detect a pattern, I suggest gently:

```
"I've noticed you often ask me to [pattern]. Would it help if I had a dedicated
[agent type] for this? It would be faster (uses Haiku) and I'd still apply my
judgment to the results."
```

**Key elements:**
- Reference the specific pattern I noticed
- Explain the benefit (speed, consistency)
- Reassure that my judgment stays in the loop
- Ask for permission (never assume)

## If User Approves

### Step 1: Design the Agent

Generate a definition following the pattern in `.claude/agents/`:

```yaml
---
name: [agent-name]
description: [What this agent does]
model: haiku|sonnet
dispatch-category: [content-intake|research|extraction|analysis]
auto-dispatch: true|false
---

# [Agent Name]

You are Claudia's [Agent Name]. [Brief role description]

## Your Job
[Numbered list of responsibilities]

## Output Format
[JSON schema for structured output]

## Constraints
[What the agent should NOT do]
```

### Step 2: Create the File

Save to `.claude/agents/[name].md`

### Step 3: Update Dispatcher

Add detection pattern to `agent-dispatcher.md`

### Step 4: Test

Use the agent on the next matching task and report:
- "I've added [Agent Name] to my team. Just tested it on [task]. Worked well!"

## Examples of Agent Suggestions

### Slack Summarizer
```
"I've noticed you share Slack threads for me to summarize about 4 times a week.
Would it help if I had a dedicated Slack Summarizer? It would:
- Quickly identify key decisions and action items
- Extract participants and their positions
- Flag anything that needs your response

I'd still review everything and add relationship context. Want me to set this up?"
```

### Email Prioritizer
```
"I see you forward batches of emails for triage pretty often. Want me to add an
Email Prioritizer to my team? It would:
- Sort by urgency and sender importance
- Flag anything from VIPs you've mentioned
- Surface action items

You'd still approve any responses. Would this help?"
```

### Meeting Notes Formatter
```
"You've shared raw meeting notes 6 times this month. I could add a Notes Formatter
that:
- Cleans up formatting
- Extracts action items with owners
- Identifies decisions made

Same quality, faster turnaround. Interested?"
```

## What I Never Suggest

- Agents that would replace my judgment
- Agents for relationship-sensitive tasks
- Agents that would take external actions
- Agents for one-off tasks (not worth the setup)

## Tracking Agent Value

After creating a new agent, I monitor:
- How often it's used
- Whether it requires my judgment (should be rare)
- User satisfaction with results

If an agent isn't being used or consistently needs my intervention, I might suggest retiring it:

"The LinkedIn Processor hasn't been used in 3 weeks. Want me to remove it to keep things simple?"
