# Decision log

This directory holds Architecture Decision Records (ADRs) for the Claudia Autonomous project.

## Filename convention

`YYYY-MM-DD-short-topic.md`

Examples:
- `2026-04-10-fork-vs-wrapper.md`
- `2026-04-22-memory-provider-strategy.md`
- `2026-05-15-subagent-personality-inheritance.md`
- `2026-05-30-cost-governance-enforcement-point.md`

## How to log a decision

1. Copy `TEMPLATE.md` to a new file named per the convention above.
2. Fill in every section. Do not skip "Options considered" — future you will thank present you.
3. Set the status:
   - `proposed` — drafted, not yet accepted
   - `accepted` — we're doing this
   - `superseded by YYYY-MM-DD-xxx.md` — an older decision replaced by a newer one
4. Link to the ADR from the phase file that prompted the decision (in its `Decisions made this phase` section).
5. Commit.

## Never do

- Never edit an accepted ADR in place to reflect a changed decision. Write a new ADR and mark the old one superseded. The point of ADRs is the audit trail.
- Never delete an ADR, even one that was never accepted. Mark it `superseded` or `withdrawn` and keep the file.

## Pre-identified decisions (from the roadmap)

These are listed in the roadmap as decisions that must be made during execution. When one of them is resolved, write the corresponding ADR:

1. **Fork vs wrapper** _(Phase 0)_ — outcome already baked into roadmap constraints (permanent fork, own repo), but write it up so the reasoning is preserved.
2. **Memory provider strategy** _(Phase 2A)_ — which methods of the v0.7.0 provider ABC do we implement, extend, or register alongside?
3. **Subagent personality inheritance** _(Phase 3)_ — how much of Claudia's persona do subagents inherit? Roadmap recommends abbreviated persona (~500 tokens).
4. **Cost governance enforcement point** _(Phase 2B)_ — per-request, per-session, or per-day enforcement of token budgets?

## Index

| Date | Topic | Status | Linked phase |
|---|---|---|---|
| 2026-04-09 | [Fork vs wrapper](2026-04-09-fork-vs-wrapper.md) | accepted | Phase 0 |
