---
name: gateway
description: Start, stop, or check status of the Claudia Gateway service for messaging integrations.
argument-hint: "[start|stop|status]"
---

# Gateway

Manage the Claudia Gateway service (Telegram, Slack) from within a session. Start, stop, or check status without needing a separate terminal.

**Triggers:** `/gateway`, `/gateway start`, `/gateway stop`, `/gateway status`, or natural language like "start the gateway", "connect telegram", "stop the gateway", "is the gateway running?"

---

## Argument Handling

Parse the user's input to determine the subcommand:

| Input | Subcommand |
|-------|------------|
| `/gateway start`, "start the gateway", "connect telegram" | **start** |
| `/gateway stop`, "stop the gateway", "disconnect telegram" | **stop** |
| `/gateway status`, `/gateway`, "is the gateway running?" | **status** |

If no subcommand is clear, default to **status**. If the gateway isn't running, offer to start it.

---

## Status

Check whether the gateway is currently running and report its state.

```bash
# Check PID file and verify process is alive
if [ -f ~/.claudia/gateway.pid ]; then
  PID=$(cat ~/.claudia/gateway.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "RUNNING:$PID"
  else
    echo "STALE_PID:$PID"
  fi
else
  echo "NOT_RUNNING"
fi
```

Then gather additional details if running:

```bash
# Show recent log output for provider/channel info
tail -20 /tmp/claudia-gateway.log 2>/dev/null
```

**Report to user:**

If running:
```
**Gateway Status**
- **Status:** Running (PID [pid])
- **Provider:** [Ollama/Anthropic, from log output]
- **Channels:** [Telegram/Slack, from log output]
- **Memory:** [Connected/Disconnected, from log output]
```

If not running:
```
"The gateway isn't running. Want me to start it? (`/gateway start`)"
```

If stale PID (file exists but process is dead):
```
"Found a stale PID file (process [pid] is gone). Cleaning up."
```
Then remove the stale PID file:
```bash
rm ~/.claudia/gateway.pid 2>/dev/null
```

---

## Start

Start the gateway service in the background.

### Step 1: Check if already running

Run the status check above. If the gateway is already running, report:
```
"The gateway is already running (PID [pid]). Use `/gateway status` for details or `/gateway stop` to restart."
```

### Step 2: Verify gateway is installed

```bash
ls ~/.claudia/gateway/src/index.js 2>/dev/null
```

If not found:
```
"The gateway isn't installed yet. You can set it up by running the gateway installer:
`bash ~/.claudia/gateway/scripts/install.sh`"
```

### Step 3: Source shell profile and start

```bash
source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null
nohup node ~/.claudia/gateway/src/index.js start > /tmp/claudia-gateway.log 2>&1 &
echo "STARTED_PID:$!"
```

### Step 4: Wait and verify

```bash
sleep 3
if [ -f ~/.claudia/gateway.pid ]; then
  PID=$(cat ~/.claudia/gateway.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "VERIFIED:$PID"
    tail -10 /tmp/claudia-gateway.log
  else
    echo "FAILED"
    tail -20 /tmp/claudia-gateway.log
  fi
else
  echo "NO_PID_FILE"
  tail -20 /tmp/claudia-gateway.log
fi
```

**Report to user:**

If verified:
```
**Gateway Started**
- **PID:** [pid]
- **Provider:** [parsed from log]
- **Channels:** [parsed from log]

Messages will be queued for your next session or available via "check telegram".
```

If failed, show the error from the log:
```
"The gateway failed to start. Here's the error:
[relevant lines from log]

Common issues:
- `TELEGRAM_BOT_TOKEN` not set in your shell profile or `~/.claudia/config.json`
- Ollama not running (if using local models)
- Port conflict on 3848"
```

---

## Stop

Stop the running gateway service.

```bash
node ~/.claudia/gateway/src/index.js stop
```

Then verify it stopped:

```bash
sleep 1
if [ -f ~/.claudia/gateway.pid ]; then
  PID=$(cat ~/.claudia/gateway.pid)
  if kill -0 "$PID" 2>/dev/null; then
    echo "STILL_RUNNING:$PID"
  else
    echo "STOPPED_CLEAN"
    rm ~/.claudia/gateway.pid 2>/dev/null
  fi
else
  echo "STOPPED_CLEAN"
fi
```

**Report to user:**

If stopped cleanly:
```
"**Gateway stopped.** Telegram messages will queue until you start it again."
```

If still running (unlikely):
```
"The gateway didn't stop cleanly. Force stopping..."
```
Then:
```bash
kill -9 $(cat ~/.claudia/gateway.pid) 2>/dev/null
rm ~/.claudia/gateway.pid 2>/dev/null
```

---

## Tone

- Keep it brief and operational
- If something fails, be specific about the error and suggest fixes
- Don't over-explain what the gateway is if the user already knows (they invoked the command)
