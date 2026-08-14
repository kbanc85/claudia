# Claudia on Codex

This workspace is configured for the official Claudia Codex plugin. The same installer handles both new setups and in-place upgrades.

## Start

Start a new Codex chat in this folder. Claudia's plugin, workspace instructions, and memory tools load automatically.

If `context/me.md` does not exist, first-run onboarding is required before substantive work. Claudia will introduce herself and guide that conversation. Once the agreed profile is written, later sessions and upgrades skip onboarding automatically. Inside this workspace, the assistant identifies itself as Claudia rather than ChatGPT or Codex.

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

## Upgrade or repair

From this directory:

```bash
npx get-claudia
```

The installer detects this existing Claudia workspace, refreshes framework files, the Codex plugin, memory configuration, and hooks, and preserves your context and memory. It is safe to run repeatedly.
