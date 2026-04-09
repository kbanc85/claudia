# Risk register

Live mutable register. Derived from the roadmap's Risk register section, but this copy evolves as risks change state during execution. The roadmap file itself stays immutable; this one changes.

## Status values

- `open` — known risk, no action yet
- `monitoring` — active watch, mitigation in place
- `fired` — risk event has occurred, recovery in progress
- `resolved` — mitigation worked or risk no longer applies

---

## R1 — Memory provider ABC doesn't support Claudia's full feature set

- **Impact**: High
- **Status**: open
- **Current mitigation**: Extend the ABC if needed, or register additional tools alongside the provider (v0.7.0's plugin system supports this).
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 2A
- **Notes**:
  - _(empty — update when Phase 2A begins)_

---

## R2 — Skills degrade on non-Anthropic models

- **Impact**: Medium
- **Status**: open
- **Current mitigation**: Model compatibility test script (Task 3.2) catches this early. Every core skill runs through the script across 3+ model endpoints before being declared done.
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 3
- **Notes**:
  - Critical for the "full capability on frontier, Claudia Lite on local" promise. If this risk fires heavily, Claudia Lite mode scope needs redefinition.

---

## R3 — Rebrand misses "hermes" references that surface at runtime

- **Impact**: Low
- **Status**: open
- **Current mitigation**: Grep sweep (Task 0.2) + integration tests (Task 0.4) + beta testers (Task 7.4).
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 0, 7
- **Notes**:
  - Likelihood of complete eradication is actually low, but impact per incident is small (cosmetic, easy to fix). Accept as low-priority ongoing cleanup.

---

## R4 — 6,933-line `run_agent.py` is too large for single Claude Code sessions

- **Impact**: Medium
- **Status**: open
- **Current mitigation**: Work on specific methods/sections, not the whole file. Keep a method index in the phase file if Claude Code needs it.
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 2B, 4 (any phase that touches the agent loop)
- **Notes**:
  - If this fires (Claude Code runs out of context mid-edit), split the work across sessions by method. The ReAct loop and the subagent delegation code are the two biggest sections.

---

## R5 — Concurrent memory access causes data corruption

- **Impact**: High
- **Status**: open
- **Current mitigation**: WAL mode (mandatory) + write serialisation + synthetic load testing in Phase 2A.3.
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 2A, 5 (full-system concurrency test)
- **Notes**:
  - This is the single highest-severity risk for server deployment. Synthetic load test must pass before 2A can be declared complete. No exceptions.

---

## R6 — Prompt budget exceeds small model context windows

- **Impact**: Medium
- **Status**: open
- **Current mitigation**: Aggressive truncation strategies (Task 2B.6) + Claudia Lite mode definition (post-MVP, Phase 8).
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 2B, 4 (prompt component injection), 7 (edge case testing)
- **Notes**:
  - Baseline budget is ~9,300 tokens. On a 32K model that's 29% of context — over the 25% target. Truncation strategy must be in place before Phase 7 edge-case testing.

---

## R7 — Gateway message format differences cause UX breaks

- **Impact**: Medium
- **Status**: open
- **Current mitigation**: Canonical `ClaudiaMessage` format (Task 5.2) + per-platform testing in Phase 7.2.
- **Last reviewed**: 2026-04-08
- **Owner**: _tbd_
- **Phase**: 5, 7
- **Notes**:
  - Telegram (4096 char) and Discord (2000 char) splitting logic needs per-platform test coverage. Email threading is the sneaky one.

---

## How to add a new risk

1. Give it the next R-number.
2. Use the same skeleton (Impact, Status, Current mitigation, Last reviewed, Owner, Phase, Notes).
3. If a risk fires during execution, change status to `fired`, add a note with the date and a one-line description, and link to the session log entry that recorded it.
4. If a risk becomes truly irrelevant (e.g. a phase is scoped out), mark it `resolved` with a reason, don't delete it.
