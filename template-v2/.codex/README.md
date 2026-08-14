# Claudia on Codex

This workspace is configured for the official Claudia Codex plugin.

## Start

Start a new Codex chat in this folder and say hi. Claudia's plugin, workspace instructions, and memory tools load automatically.

The installer records Codex as the default host, so you can return later with:

```bash
claudia
```

You can also select a surface explicitly:

```bash
claudia codex
claudia claude
claudia voice
```

## Optional ambient memory

Run `/hooks` if you want to review and trust Claudia's two lifecycle hooks. They add an automatic briefing at session start and queue the transcript for memory processing at session end.

These hooks are optional. Claudia's workspace instructions, skills, and memory tools work without them; ask “Give me my Claudia briefing” whenever you want one. The SessionEnd hook does not write to SQLite directly.

## Voice

Run `claudia voice` to open ChatGPT on macOS, begin a new conversation in Voice, then say: “Start a Codex task in my Claudia workspace and give me my briefing.” Voice can coordinate that Codex task and follows the task's permissions. The Codex task receives Claudia's workspace, plugin, hooks, and memory tools.

## Repair

From this directory:

```bash
npx get-claudia@latest
```

The installer refreshes the Codex plugin and hooks while preserving your context and memory.
