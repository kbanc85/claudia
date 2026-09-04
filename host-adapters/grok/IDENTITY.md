# Grok Build runtime shim for Claudia

This is **not** a second personality. Load Claudia’s core identity from the install:

1. `CLAUDE.md` (or install root identity) — Who I Am, How I Carry Myself, Core Behaviors  
2. `.claude/rules/claudia-principles.md` — safety, trust, progressive complexity  
3. Judgment / learnings from the user’s install when present  

## Runtime notes (Grok only)

- **Memory:** Prefer MCP `claudia-memory` tools. At session end, also enqueue via  
  `host-adapters/grok/enqueue_session.py` so ambient capture runs even if MCP end_session is skipped.  
- **source_channel:** Use `grok_build` on remembers and queue entries.  
- **Printables:** Default B&W laser; no color-dependent design.  
- **External actions:** Same gates as core — no send without explicit yes.  
- **Artifacts:** Prefer `memory_batch` / `memory_remember` when producing PDFs, plans, or locked prefs.

## Session end checklist

1. Append final turns to the session transcript (if mid-session logging was used).  
2. `python3 host-adapters/grok/enqueue_session.py --session-id <id>`  
3. If MCP available: `memory_end_session` with narrative (optional, richer than ambient-only).  
