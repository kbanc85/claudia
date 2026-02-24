# PRD Review: Strengths and Gaps

*Review of `prd.md` -- what's strong, what's weak, what's missing.*

---

## What's Strong

1. **"Personal data lake" framing.** Positions Claudia Desktop as more than a chatbot. The insight that value is in accumulation -- after a month, Claudia knows your world -- is the right pitch.

2. **Phased delivery is realistic.** 6 phases, 14 weeks, 4-6 tasks per phase. Each phase has a clear milestone you can ship behind. Nothing feels padded.

3. **"What we are NOT building" is the most important section.** The scope fences are tight: not SaaS, not team tool, not voice, not rebuilding the daemon. These boundaries prevent scope creep.

4. **The data flow diagram (connector -> ingest -> remember) is the core architecture insight.** Every connector becomes a memory source. This is the thing that makes Claudia different from "Rowboat with a plugin."

5. **Integration points reference specific files.** Section 7 names exact Rowboat source files and what happens at each injection point. Engineers can start from these.

6. **All Rowboat features retained.** The "keep everything" principle is correct. Rowboat is a shipping product with 8,100 stars. Extend, don't strip.

---

## What's Weak or Missing

### 1. The "Dual Database" Open Question is a Cop-Out

The PRD says "start with dual database (MongoDB + SQLite), migrate later." That means shipping Phase 1 with four processes: Electron, Python daemon, MongoDB server, and implicitly Qdrant/Redis if you keep Rowboat's existing features working.

This contradicts the entire pitch of "single file, zero servers, you own your data."

**Recommendation:** Kill this option. Replace MongoDB/Qdrant/Redis with SQLite during the fork. One database file. See `database-analysis.md` for full reasoning.

### 2. The File/Document Browser is Underspecified

Section 6.6 says "extend Rowboat's file browser with PARA structure" in 5 bullet points. For something that should feel like a lightweight Obsidian, that needs much more design. See `obsidian-browser-design.md` for a proper spec.

### 3. The Ingestion Pipeline is Hand-Waved

"Gmail sync output runs through entity extraction" is a sentence, not a design. Missing:

- **Volume handling:** What happens when 500 emails arrive on first sync? Rate limiting? Batching?
- **Cost estimation:** Every email hitting an LLM for entity extraction costs money (API) or time (Ollama). What's the budget?
- **Noise filtering:** Newsletters, receipts, automated notifications -- these should be filtered before hitting the LLM. Not every email is worth remembering.
- **Prioritization:** Recent emails and emails from known entities should be processed first.
- **Incremental sync:** Only process new content since last sync, not the full history every time.

**Recommendation:** Add a filtering/prioritization layer to the ingestion pipeline design in Phase 3. Task 3.2 (Gmail to memory) needs subtasks for noise detection and rate limiting.

### 4. No Offline Story

The PRD says Ollama for embeddings and "bring your own API key" for LLM, but there's no section on what happens when:

- The user has no internet connection
- No API key is configured yet
- Ollama isn't installed or isn't running

The app should degrade gracefully:
- Memory storage works (SQLite, always local)
- Recall works via FTS fallback (no embeddings needed)
- Memory browser works (search by keyword instead of semantic similarity)
- Chat doesn't work (needs LLM), but shows a clear message
- Ingestion queues content for later processing when LLM becomes available

**Recommendation:** Add a "Graceful Degradation" section to the PRD.

### 5. Morning Brief Delivery Mechanism is Vague

"System tray notification when brief is ready" -- but the flow is unclear:

- Who generates the brief? The Python daemon on a schedule (APScheduler job)?
- Or does the Electron app request it on demand?
- What if the app wasn't running at the configured delivery time?
- What if the user opens the app at 2 PM -- do they still get the morning brief?

**Concrete proposal:**
1. Python daemon generates the brief as a scheduled job (e.g., 7 AM daily)
2. Brief is stored in the database (not ephemeral)
3. Electron polls for unread briefs on app launch
4. If the app wasn't running at generation time, the brief is waiting when the user opens the app
5. System tray notification fires only if the app is running at generation time
6. Briefs are date-stamped; stale briefs (>24h) are marked but still accessible

### 6. No Data Portability Section

For a product whose pitch is "you own your data," there's no mention of:

- **Export formats:** Can the user export all memories as JSON/CSV?
- **Backup strategy:** Claudia v1 has `Database.backup()` with rolling retention. This should be called out.
- **Migration to new machine:** Copy `~/.claudia/` to new machine and it works?
- **Import from other tools:** Can the user import contacts, notes, or existing knowledge?

**Recommendation:** Add a "Data Portability" section. This is a selling point, not a footnote.

### 7. Naming

The PRD uses "ClawDia" throughout. The project is called **Claudia**. Update all references.

---

## Minor Issues

- Section 7.1 references `~/.clawdia/config.json` -- should be `~/.claudia/config.json`
- IPC channel names use `clawdia:memory:*` -- should be `claudia:memory:*`
- Phase 1 task 1.1 says "Fork Rowboat repo" but doesn't mention which branch/tag to fork from
- No mention of Rowboat's existing test suite -- do we run their tests after the fork?
- Success metrics (Section 10) are qualitative. Consider adding quantitative targets (e.g., "recall latency < 200ms for 10K memories")
