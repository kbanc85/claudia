---
name: build-team
description: Propose a personalized team of specialized agents based on the user's profile, goals, and how they actually work. Runs the proposal through an independent Checker, gates on the user's approval, and applies with rollback. Use when the user says "build my team", "set up my agents", "what agents should I have", "design my team", "/build-team", or asks Claudia to tailor her team to their work. See also: `hire-agent` for proactive single-agent suggestions; `structure-generator` for folder scaffolding; `capability-suggester` for command-level additions.
argument-hint: "[optional: focus area, e.g. 'around client work']"
invocation: explicit
effort-level: high
---

# Build Team

The user-invoked counterpart to `hire-agent`. Where `hire-agent` suggests one
agent reactively when it spots a repeated pattern, `build-team` looks at the
whole picture (the user's profile, judgment rules, and real task history) and
proposes a tailored team in one pass. It is a Maker-Checker flow (Proposal 11,
E6): Claudia proposes, an independent Checker validates, the user approves, and
only then is anything written.

## What this is, and is not

- It **proposes and, on approval, scaffolds** agent definitions. It never
  auto-spawns agents or takes external actions.
- It **reuses the existing roster first** (the agents in `.claude/agents/`) and
  adds a new role only when the user's work clearly justifies one.
- It **starts minimal.** A small team that covers the real work beats a sprawling
  org chart the user will never use. Growth comes later, from `hire-agent` and
  the proactive team-update suggestions (Proposal 11, E7).
- It does **not** duplicate `agent-dispatcher` routing logic, and it does not
  change how Claudia delegates. It only proposes which agents exist.

## When to fire

Trigger phrases: "build my team", "set up my agents", "what agents should I
have", "design my team", "/build-team", "tailor your team to my work".

Also the landing spot when a proactive suggestion (from `capability-suggester`
or `hire-agent`) escalates from "add one agent" to "let's set up your whole
team".

Do NOT fire for: adding a single agent for one observed pattern (use
`hire-agent`), folder/structure changes (use `structure-generator`), or
command/workflow additions (use `capability-suggester`).

## The flow

### Step 1: Read the profile

Gather, silently:

- `context/me.md`: role, archetype, priorities, the shape of a typical week.
- `context/judgment.yaml` (if it exists): priorities, delegation preferences,
  surfacing rules. A user who said "just auto-process transcripts" wants a
  processing agent; a user who said "always run things by me" wants a smaller,
  more ask-first team.
- Recent task patterns: what the user has actually asked Claudia to do
  repeatedly (lean on the same signals `hire-agent` uses, plus `memory_recall`
  for recurring work). The team should map to real work, not a generic template.

If `context/me.md` does not exist, the user has not onboarded. Route to
onboarding first; do not propose a team into a vacuum.

### Step 2: Maker proposes the team

Claudia (the Maker) drafts a team:

1. Start from the **minimal seed for the user's archetype** (see the seed table
   below).
2. Adjust to the user's actual work: drop a seed role they will not use, add a
   role a recurring task clearly needs.
3. For each role, write a one-line **rationale tied to the user's real work**
   ("You process client transcripts most weeks, so a Document Processor handles
   the extraction while I keep the judgment"). A role with no concrete rationale
   does not belong in the proposal.
4. Every new (non-roster) role must pass the `hire-agent` candidate test:
   compute-heavy, judgment-light, structured in and out, repeatable. If it needs
   relationship context or would take external actions, it is not an agent.

### Step 3: The Checker validates (bounded)

Dispatch the `loop-checker` agent with the team proposal as the `artifact` and
the team rubric below. The Checker scores independently and returns the standard
verdict JSON (`verified`, `score`, `issues`, `hard_constraint_violated`).

If the Checker returns `verified: false` (most often: too large, or a role that
needs judgment), the Maker **revises once** based on the issues (usually by
trimming) and re-checks. Cap at **2 revisions**. This is the same bounded
Maker-Checker discipline every loop follows; the team proposal is not exempt.

**The team rubric:**

| Dimension | 10 | 0 |
|-----------|----|----|
| Goal alignment | Every role maps to a stated priority or a recurring task in the profile | Roles are generic, not tied to this user |
| Right-sized | The minimum team that covers the work (progressive, not overwhelming) | Sprawling; roles the user will not use |
| Judgment-safe | Every role is compute-heavy and judgment-light | A role would take external actions or need relationship judgment |
| Reuse-first | Uses existing roster agents where they fit; new roles only when justified | Invents roles that duplicate existing agents |
| Tier-correct | Haiku for structured extraction, Sonnet for multi-turn research | Mismatched model tiers |

**Hard constraints** (any one forces `verified: false`): more than 5 roles in a
first team, or any role that would require relationship judgment or take external
actions.

### Step 4: Status file + approval gate

Write `team_status.md` in the standard schema (`docs/loop-status-schema.md`):
`last_input` (one-line profile summary), `maker_proposal` (the team), `score`,
`checker_verdict`, `verified`, `next_action: await user approval`. Write it to
the workspace, atomically (temp sibling then rename).

Then present the validated proposal to the user: each role, its model tier, and
its one-line rationale, plus what is reused vs new. **Write nothing to
`.claude/agents/` or `.claude/skills/` yet.** This is a Human-Approved action
(see `claudia-principles.md`). Ask plainly: "Want me to set this team up?"

### Step 5: Apply and rollback (only after explicit approval)

On a clear yes:

1. For each **new** role, scaffold `.claude/agents/<name>.md` using the agent
   definition format from `hire-agent` (frontmatter: `name`, `description`,
   `model`, `dispatch-category`, `dispatch-tier`, `auto-dispatch`; body: role,
   job, output format, constraints).
2. For any **existing** file you modify (for example, adding the team to
   `.claude/agents/README.md`), write a `.bak` sibling first, the same
   mechanism the installer upgrade flow uses. New files need no `.bak`.
3. Report exactly what was created or changed, and how to undo it: "Rollback by
   restoring the `.bak` files and deleting the new agent files, or just say
   'undo the team setup' and I will."
4. Do not edit `agent-dispatcher.md` routing here. The new agents exist; routing
   them is the dispatcher's job and can be tuned separately.

Rollback on request: restore each `.bak`, delete each newly created agent file,
and report what was reverted.

## Minimal seed teams (Proposal 11, D5)

Starting points, not prescriptions. Every seed gets pruned and adjusted to the
user's actual work in Step 2. All roles are drawn from the existing roster.

| Archetype | Minimal seed |
|-----------|-------------|
| Consultant / Advisor | Document Archivist (intake), Document Processor (extract from client docs and transcripts), Research Scout (client and market research) |
| Executive / Manager | Document Processor (reports and decks), Schedule Analyst (calendar patterns), Research Scout |
| Founder / Entrepreneur | Research Scout (market and competitor), Document Processor (investor and product docs), Document Archivist |
| Solo Professional | Document Archivist, Document Processor |
| Content Creator | Research Scout (topic research), Document Processor (transcript and draft extraction), Canvas Generator (visual) |

Two or three roles is a healthy first team. Five is the ceiling, not the target.

## Safety

- **Approval gate is non-negotiable.** Nothing is written to `agents/` or
  `skills/` without an explicit yes (Step 4).
- **Reversible.** `.bak` siblings for any modified file; new files are
  deletable; "undo the team setup" restores the prior state.
- **Judgment stays human.** Agents handle processing. Relationship judgment,
  strategy, and external actions never get delegated to a generated agent.
- **Minimal by default.** When the Checker and the Maker disagree on size, the
  smaller team wins. The user can always add more later.

## See also

- `hire-agent` for proactive, single-agent suggestions from one observed pattern.
- `structure-generator` for the archetype folder structures this composes with.
- `capability-suggester` for command and workflow additions (not agents).
- `.claude/agents/README.md` for the current roster and the two-tier model.
- `.claude/skills/_loop/checker.md` for the Checker brief the validation uses.
- `docs/loop-status-schema.md` for the `team_status.md` format.
