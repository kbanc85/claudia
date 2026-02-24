# Claudia Desktop Strategy: The Big Picture

*Written for the visionary, not the engineer. This is your decision document.*

---

## The Situation

Claudia v1 works. She remembers relationships, catches commitments, spots cooling friendships, and delivers morning briefs. She has 503 passing tests, 42+ releases, and real users. But she lives inside Claude Code -- a $20-100/month subscription that limits who can use her. She needs her own home.

Two attempts exist to give her one:

1. **Claudia2** -- an ambitious ground-up rebuild (Tauri + Svelte + FalkorDB + voice). 66 commits, zero tests, never used in production.
2. **Rowboat** -- an open-source desktop AI coworker from a YC-backed startup. 8,100 stars, Apache 2.0 license, shipping Electron app with agent orchestration and MCP support.

This document presents four paths forward and a clear recommendation.

---

## Scenario A: Fork Rowboat + Claudia's Brain (Recommended)

**The idea:** Take Rowboat's proven desktop app and fill it with Claudia's proven intelligence.

**What Rowboat gives you for free:**
- A shipping cross-platform desktop app (macOS, Windows, Linux)
- Four agent types that already work (conversation, task, pipeline, escalation)
- MCP tool integration (the same standard Claudia already speaks)
- Gmail, Google Calendar, Google Drive integrations out of the box
- Meeting transcription ingestion (Granola, Fireflies)
- An Obsidian-compatible knowledge vault with backlinks
- Global search, tabbed interface, graph visualization
- Background agents that run on their own
- 8,100 stars worth of community testing
- Apache 2.0 license (you can fork, modify, sell -- no restrictions)

**What you replace:**
- Rowboat uses MongoDB + Qdrant + Redis (three servers to run). You swap all of that for Claudia's single SQLite file with sqlite-vec. Lighter, proven, no server dependencies.
- Rowboat's flat markdown vault becomes Claudia's PARA-structured second brain (Active, Relationships, Reference, Archive -- the same Obsidian layout you already have).

**What you add from Claudia:**
- The memory daemon (Python sidecar, already battle-tested)
- Relationship tracking with attention tiers, contact velocity, cooling alerts
- Commitment detection that catches "I'll send that by Friday" automatically
- Pattern recognition that spots trends across weeks
- Morning briefs that tell you what needs attention today
- Personality and archetype-based personalization
- Trust provenance on every memory ("You told me" vs. "I inferred")
- The 3D brain visualizer

**What you salvage from Claudia2:**
- The sidecar lifecycle pattern (how to start/stop the Python daemon alongside the app)
- The onboarding wizard concept (7-step first-run flow)
- The CI/CD matrix for building on Mac, Windows, and Linux
- Diagnostic logging patterns

**Timeline:** 6-10 weeks to a first usable version.

**Risk level:** Medium. The integration work is real -- learning Rowboat's codebase, wiring up Claudia's memory, adapting the UI. But both codebases are proven. You're connecting two working systems, not building from scratch.

**Why this wins:** Rowboat gives you 60% of the work (the desktop app shell, agent framework, integrations). Claudia gives you the 40% that actually matters (the intelligence that makes it different from every other AI tool). Neither could do this alone. Together, they're complete.

---

## Scenario B: Ship Claudia2 As-Is

**The idea:** Finish what was started. Take the 66-commit Claudia2 codebase and make it production-ready.

**Why you shouldn't:**

The engineering surface area is 10x what one person can maintain. Here's what Claudia2 actually requires:

- **FalkorDB** needs a running Redis-compatible graph database server. This is not "local-first" -- it's a server dependency. Claudia v1 does the same work with a single SQLite file.
- **LanceDB + PyArrow** add 200MB to the bundle just for vector search. Claudia v1's sqlite-vec does the same thing at 2MB.
- **LangGraph** orchestrates 8 specialist agents. Architecturally elegant, operationally nightmarish for a solo maintainer. That's 8 prompt surfaces to tune, test, and keep in sync.
- **The voice pipeline** is 807 lines of Rust that has never processed a real utterance. Whisper, Silero VAD, Piper TTS -- impressive on paper, untested in practice.
- **First-run download:** 310MB installer + 2.5GB Ollama model download. Users commit 2.8GB before seeing any value.
- **Seven languages in the critical path:** Rust, Python, TypeScript, SQL, Cypher, TOML, JSON.
- **Zero tests.** Not "few tests." Zero.

Every major subsystem wraps its imports in try/except with fallback flags. This is a polite way of saying nothing has been proven to work together.

Claudia2 is a specification with code-shaped scaffolding. Finishing it would take 4-6 months minimum, and you'd be building everything Rowboat already has -- a desktop shell, agent routing, integrations, distribution -- from scratch.

**Verdict:** Don't.

---

## Scenario C: Claude Desktop MCP Extension

**The idea:** Package Claudia's memory system as an MCP server that plugs into Claude Desktop (Anthropic's own app).

**What makes it tempting:**
- Fastest path to users: 2-4 weeks to ship
- No desktop app to build or maintain
- Ride Anthropic's distribution -- every Claude Desktop user is a potential Claudia user
- The memory daemon already speaks MCP. It's mostly packaging work.

**The trap:**
- You become a feature, not a brand. Users think of "Claude with memory," not "Claudia."
- If Anthropic ships native memory in Claude Desktop (and they will), you're obsolete overnight.
- No control over the experience. You can't add morning briefs, relationship visualizations, or proactive alerts. You only get what MCP allows.
- You're building on someone else's platform with no guarantee of stability.

**Verdict:** Good for quick validation. Dangerous as a long-term strategy.

---

## Scenario D: Hybrid (MCP Extension Now + Rowboat Fork Later)

**The idea:** Ship the MCP extension in 2-4 weeks to validate demand while building the Rowboat-based desktop app in parallel.

**Why this might be the smartest bet:**
- You learn immediately whether people want AI memory. Real usage data, real feedback.
- The MCP extension is a small investment that pays for itself in market intelligence.
- If demand is strong, you have confidence to invest in the desktop app.
- If demand is weak, you saved months of desktop development.
- The two tracks don't conflict -- the memory daemon is the same codebase either way.

**The risk:**
- Two codebases to maintain simultaneously (though the MCP extension is lightweight).
- You might get distracted optimizing the extension when the desktop app is the real prize.
- If the extension gets popular, migrating users to a desktop app creates friction.

**Verdict:** Safest bet if you want data before committing. Ship fast, learn fast, build the real thing with confidence.

---

## The Critical Gap Nobody Talks About

Claudia v1 works because Claude Code provides the LLM. The AI model, the reasoning, the language understanding -- it all comes from Claude's API through the Claude Code subscription.

A standalone desktop app needs its own LLM connection. This means:
- Users need an API key (Anthropic, OpenAI, or similar), or
- You bundle a local model (Ollama), or
- You provide a hosted service (and become a SaaS company)

Rowboat already solves this. It supports OpenAI, Anthropic, Google Gemini, OpenRouter, and Ollama out of the box. Users bring their own API key or run a local model. This is another reason the fork makes sense -- the LLM connection problem is already solved.

---

## Recommendation

**Start with Scenario A (Fork Rowboat + Claudia's Brain).** Here's why:

1. **It's the fastest path to a real product.** Rowboat gives you a shipping desktop app today. Claudia gives you the intelligence that makes it special. Neither is starting from zero.

2. **The license allows it.** Apache 2.0 is the most permissive open-source license. You can fork, modify, rebrand, and sell without restriction.

3. **The architectures are compatible.** Both use MCP. Both support multi-agent patterns. Both store knowledge in Obsidian-compatible markdown. The main work is swapping the database layer (MongoDB/Qdrant/Redis for SQLite) and adding Claudia's memory services.

4. **It lets you kill Claudia2 guilt-free.** The good ideas from Claudia2 (onboarding wizard, sidecar pattern, CI/CD) come along. The bad ideas (FalkorDB, LangGraph, voice pipeline) stay behind.

5. **It's honest about what one person can maintain.** A solo developer can maintain a fork with focused changes. A solo developer cannot maintain Claudia2's seven-language, eight-agent, three-database architecture.

If you want extra safety, consider the Hybrid approach (Scenario D): ship a lightweight MCP extension in 2-4 weeks to validate demand, then invest in the Rowboat fork with market confidence.

---

## Next Steps

1. **Read** `what-claudia-brings.md` to understand exactly what makes Claudia irreplaceable -- these are the features you protect no matter which path you choose.
2. **Read** `rowboat-integration-plan.md` to see the concrete plan for how the fork would work.
3. **Decision point:** Choose Scenario A (fork directly) or Scenario D (MCP extension first, then fork).
4. **Fork Rowboat** at github.com/rowboatlabs/rowboat and start exploring the codebase.
