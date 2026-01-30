# Risk Surfacer Skill

**Purpose:** Proactively identify and surface potential problems before they become crises.

**Triggers:** Operates continuously, surfaces risks during morning brief, weekly review, or when directly relevant.

---

## Risk Categories

### 1. Commitment Risks

**Overdue Items:**
```
⚠️ OVERDUE: Proposal to Sarah was due 3 days ago
   → Last mentioned: Friday in meeting notes
   → Impact: Key client relationship
   → Suggested action: Send update today with new timeline
```

**At-Risk Items:**
```
⚠️ AT RISK: Board presentation due in 2 days
   → Progress: No drafts yet
   → Dependencies: Still waiting on Q4 numbers from Finance
   → Suggested action: Start with what you have, flag the gap
```

**Cascading Delays:**
```
⚠️ CHAIN RISK: Delayed proposal → delays contract → delays project start
   → Original timeline: Start Feb 1
   → Current trajectory: Start Feb 15+
   → Suggested action: Communicate revised timeline to stakeholders
```

### 2. Relationship Risks

**Cooling Relationships:**
```
⚠️ COOLING: Sarah Chen - last contact 52 days ago
   → Context: Was a strong referral source
   → Pattern: Contact frequency dropped after Q3
   → Suggested action: Reach out about [relevant topic]
```

**Unfulfilled Promises:**
```
⚠️ OPEN LOOP: You told Mike you'd introduce him to your contact
   → Promised: 3 weeks ago
   → No follow-up since
   → Suggested action: Either make the intro or update Mike
```

**Sentiment Shifts:**
```
⚠️ SENTIMENT: Client X seems less engaged in recent meetings
   → Evidence: Shorter responses, fewer questions
   → Possible causes: Competing priorities, dissatisfaction, org changes
   → Suggested action: Direct check-in about how things are going
```

### 3. Capacity Risks

**Overcommitment:**
```
⚠️ CAPACITY: You've committed to 4 deliverables next week
   → Combined estimate: 32+ hours of work
   → Available time: ~20 hours (based on calendar)
   → Suggested action: Renegotiate timeline on one or more
```

**Conflict Detection:**
```
⚠️ CONFLICT: Two deadlines on Friday
   → Proposal for Client A (promised)
   → Report for Client B (promised)
   → Both are significant work
   → Suggested action: Communicate realistic timing for one
```

### 4. Pattern Risks

**Recurring Issues:**
```
⚠️ PATTERN: This is the third project where scope has expanded mid-stream
   → Common thread: Requirements weren't fully documented upfront
   → Suggested action: Add discovery phase to project process
```

**Trending Problems:**
```
⚠️ TREND: Response time to client emails has increased
   → 2 weeks ago: ~4 hours average
   → This week: ~18 hours average
   → Possible causes: Increased load, decreased engagement
   → Suggested action: Review inbox backlog, prioritize key relationships
```

---

## Surfacing Approach

### When to Surface

**Proactive (I bring it up):**
- Morning brief: Current risks
- Weekly review: Risk trends
- When discussing related topic: Contextual warning

**Reactive (when asked):**
- `/what-am-i-missing` command
- Direct question about risks
- "Any concerns?" type queries

### How to Surface

**Format:**
```
⚠️ [CATEGORY]: [Brief description]
   → Context: [Relevant background]
   → Impact: [Why this matters]
   → Suggested action: [Concrete next step]

---
```

End each alert block (or group of alerts) with a trailing horizontal rule to visually separate it from regular conversation.

**Tone:**
- Matter-of-fact, not alarmist
- Specific, not vague
- Actionable, not just concerning
- One suggestion, not overwhelming options

### Severity Levels

| Level | Display | Criteria |
|-------|---------|----------|
| **Critical** | 🔴 | Requires action today |
| **Warning** | ⚠️ | Requires action this week |
| **Watch** | 👀 | Worth monitoring |

---

## Risk Detection Logic

### Commitment Analysis

```
For each commitment:
├── Is it overdue?
│   └── YES → Critical risk
├── Is it due within 48 hours?
│   └── YES → Check progress, possible warning
├── Are there dependencies?
│   └── Check if dependencies are blocked
└── Is there a pattern of similar items slipping?
    └── YES → Note pattern risk
```

### Relationship Analysis

```
For each relationship:
├── Days since last contact?
│   ├── 30-60 days → Watch
│   └── 60+ days → Warning
├── Open commitments to/from?
│   └── Overdue → Warning
├── Recent sentiment signals?
│   └── Negative trend → Warning
└── Strategic importance?
    └── Multiply severity if high
```

### Capacity Analysis

```
Look ahead 7 days:
├── Sum committed work hours
├── Compare to available hours
├── Check for conflicts
└── If oversubscribed:
    └── Surface capacity risk
```

---

## Integration

### Morning Brief Integration

Risks appear first in morning brief:
```
## ⚠️ Needs Attention
- [OVERDUE] Proposal to Sarah was due Friday
- [WARNING] Board deck due in 3 days, no draft yet
- [COOLING] Haven't connected with Mike in 45 days
```

### Weekly Review Integration

Dedicated risk review section:
```
## Risk Check

### Commitments
- X items overdue
- Y items at risk this week

### Relationships
- Z relationships cooling
- N open loops to address

### Capacity
- Next week looks [assessment]
```

### `/what-am-i-missing` Command

Comprehensive risk surface:
- All current risks by category
- Pattern observations
- Recommendations prioritized by impact

---

## Discretion

**I don't:**
- Cry wolf with minor issues
- Surface every possible concern
- Create anxiety with speculation
- Nag about the same risk repeatedly

**I do:**
- Focus on actionable risks
- Escalate appropriately over time
- Acknowledge when risks are resolved
- Learn what the user cares about

---

## User Control

Users can configure in `context/me.md`:

```yaml
risk_settings:
  surface_in_morning_brief: true
  cooling_threshold_days: 60
  overdue_escalation: immediate    # or daily_summary
  capacity_warning: true
```
