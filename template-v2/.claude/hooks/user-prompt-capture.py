#!/usr/bin/env python3
"""UserPromptSubmit hook: detect canonical-fact trigger phrases and destructive
verbs in user prompts, inject reminder context for the agent.

Reads hook payload from stdin (Claude Code hook contract).
Outputs JSON with additionalContext when triggers fire. Outputs nothing otherwise.

Designed to complete in <5ms (regex match + simple JSON output, no network).

Two trigger classes:
1. Memory-commitment phrases ("lock this in", "remember this", "this is canonical")
   -> Inject reminder for the agent to save the fact to memory immediately,
      per the memory-commitment rule (which governs tool selection).
2. Destructive operation patterns (rm -rf, drop table, force push, etc.)
   -> Inject "verify before acting" reminder per Claudia's safety-first principle.

Both classes can fire on the same prompt; both messages are concatenated.
"""

import json
import re
import sys

# Trigger phrases that signal the user is asserting a canonical fact.
# Word boundaries (\b) used to avoid matching inside other words.
COMMITMENT_TRIGGERS = [
    r"\block this in\b",
    r"\bremember this\b",
    r"\bthis is canonical\b",
    r"\bthis is locked\b",
    r"\bsave this for later\b",
    r"\bimportant to remember\b",
    r"\bfor the record\b",
    r"\bdon'?t forget\b",
]

# Destructive operation patterns. Narrow matches to limit false positives.
# Conversation about deletion ("how do I undo a delete?") should NOT fire these.
DESTRUCTIVE_PATTERNS = [
    r"\brm\s+-rf\b",
    r"\bdrop\s+(table|database|schema)\b",
    r"\bgit\s+push\s+(?:-+f\b|--force\b)",
    r"\bgit\s+reset\s+--hard\b",
    r"\btruncate\s+table\b",
    r"\bDELETE\s+FROM\b",  # SQL all-caps signals intent
]

# Human-readable labels for each destructive pattern. Keep keys in lockstep
# with DESTRUCTIVE_PATTERNS so the model never sees raw regex syntax.
PATTERN_LABELS = {
    r"\brm\s+-rf\b": "rm -rf (recursive delete)",
    r"\bdrop\s+(table|database|schema)\b": "DROP TABLE/DATABASE/SCHEMA",
    r"\bgit\s+push\s+(?:-+f\b|--force\b)": "git push --force",
    r"\bgit\s+reset\s+--hard\b": "git reset --hard",
    r"\btruncate\s+table\b": "TRUNCATE TABLE",
    r"\bDELETE\s+FROM\b": "DELETE FROM (SQL)",
}

# Fail-fast at import time if a pattern is missing a label (or vice versa).
assert set(DESTRUCTIVE_PATTERNS) == set(PATTERN_LABELS), (
    "Every DESTRUCTIVE_PATTERN must have a matching PATTERN_LABELS entry"
)


def detect(text: str, patterns: list) -> list:
    """Return list of pattern strings that matched in the text."""
    return [p for p in patterns if re.search(p, text, re.IGNORECASE)]


def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        payload = json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return

    # Claude Code passes the user's prompt under "prompt" (newer) or "text" (older).
    prompt = payload.get("prompt") or payload.get("text") or ""
    if not prompt:
        return

    commitment_hits = detect(prompt, COMMITMENT_TRIGGERS)
    destructive_hits = detect(prompt, DESTRUCTIVE_PATTERNS)

    if not commitment_hits and not destructive_hits:
        return

    sections = []

    if commitment_hits:
        sections.append(
            "**Canonical-fact trigger detected.** Per the memory-commitment rule, "
            "save the canonical fact to memory immediately. Do not batch to "
            "/meditate. After saving, continue the conversation normally and "
            "briefly surface that the fact has been recorded so the user knows "
            "it is recoverable in future sessions."
        )

    if destructive_hits:
        # Show up to three matched patterns for context, using human-readable
        # labels so raw regex syntax never reaches the model.
        labels_list = ", ".join(
            f"`{PATTERN_LABELS[p]}`" for p in destructive_hits[:3]
        )
        sections.append(
            f"**Destructive operation pattern detected** ({labels_list}). "
            "Per the safety-first principle, verify with the user before executing: "
            "show what will happen (recipients, content, irreversible effects), ask "
            "for explicit confirmation, then proceed only on a clear yes. Silence or "
            "ambiguity means do not proceed."
        )

    output = {"additionalContext": "\n\n".join(sections)}
    print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block Claude
