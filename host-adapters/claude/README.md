# Claude Code host

Claude’s host adapter already ships as hooks under:

```
template-v2/.claude/hooks/
  session-enqueue.py      # SessionEnd → sessions_pending.jsonl
  session-health-check.py # SessionStart daemon probe + self-heal (v1.66)
  session-summary.py
  user-prompt-capture.py
  post-tool-capture.py
  pre-compact.py
```

Do **not** duplicate those scripts here. Over time they should call
`host-adapters/shared/enqueue.py` so Claude and Grok share one writer.

Ambient capture design: Proposal 12 + v1.65.0 changelog.
