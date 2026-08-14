# Claudia on Codex

This workspace is configured for the official Claudia Codex plugin.

## Start

```bash
claudia
```

The installer records Codex as the default host, so `claudia` opens this directory in Codex. You can also select a surface explicitly:

```bash
claudia codex
claudia claude
claudia voice
```

## First Codex session

1. Run `/hooks`, review Claudia's two plugin hooks, and trust them.
2. Start a new session so the SessionStart briefing hook can load current memory.
3. Ask “Give me my Claudia briefing” to verify the MCP memory connection.

The SessionEnd hook queues the Codex transcript for Claudia's local memory daemon. It does not write to SQLite directly.

## Voice

Run `claudia voice` to open ChatGPT on macOS, begin a new conversation in Voice, then say: “Start a Codex task in my Claudia workspace and give me my briefing.” Voice can coordinate that Codex task and follows the task's permissions. The Codex task receives Claudia's workspace, plugin, hooks, and memory tools.

## Repair

From this directory:

```bash
npx get-claudia codex .
```

The installer refreshes the Codex plugin and hooks while preserving your context and memory.
