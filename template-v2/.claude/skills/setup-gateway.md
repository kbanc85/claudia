---
name: setup-gateway
description: Guided walkthrough for setting up Claudia Gateway with Telegram or Slack. Configures API keys, gateway.json, and starts the service.
effort-level: medium
---

# Gateway Setup

Walk the user through connecting Claudia to Telegram or Slack via the Gateway (API-based chat, fast and lightweight).

**Triggers:** "set up gateway", "connect telegram", "setup telegram", "setup messaging", "configure telegram", "add telegram", "telegram setup", "gateway setup"

---

## Pre-Flight (Fast, No Exploration)

Run these checks before anything else. Do NOT explore the codebase.

```bash
# 1. Gateway installed?
ls ~/.claudia/gateway/src/index.js 2>/dev/null && echo "GATEWAY_INSTALLED" || echo "GATEWAY_MISSING"

# 2. Existing config?
cat ~/.claudia/gateway.json 2>/dev/null || echo "NO_CONFIG"

# 3. Environment vars set?
[ -n "$ANTHROPIC_API_KEY" ] && echo "ANTHROPIC_KEY_SET" || echo "ANTHROPIC_KEY_MISSING"
[ -n "$TELEGRAM_BOT_TOKEN" ] && echo "TELEGRAM_TOKEN_SET" || echo "TELEGRAM_TOKEN_MISSING"

# 4. Shell profile location
[ -f ~/.zshrc ] && echo "SHELL_PROFILE:~/.zshrc" || ([ -f ~/.bashrc ] && echo "SHELL_PROFILE:~/.bashrc" || echo "SHELL_PROFILE:unknown")
```

**If GATEWAY_MISSING:** Tell the user the gateway needs to be installed first, then offer to run the installer:
```bash
bash ~/.claudia/gateway/scripts/install.sh
```
After install completes, re-run the pre-flight checks and continue.

**If config and tokens already exist and Telegram is enabled:** Skip to "Start and Verify". Don't redo what's already done.

Report what you found briefly: "Looks like the gateway is installed but Telegram isn't configured yet. Let me walk you through it."

---

## Step 1: Create a Telegram Bot

Ask the user to open Telegram and talk to **@BotFather**:

1. Send `/newbot` to @BotFather
2. Choose a display name (e.g., "Claudia")
3. Choose a username ending in `bot` (e.g., `claudia_assistant_bot`)
4. Copy the bot token @BotFather gives you

Tell them: "Paste the token here. I'll add it to your shell profile so it loads automatically."

**Wait for the token before continuing.**

---

## Step 2: Find Telegram User ID

Ask the user to message **@userinfobot** on Telegram:

1. Open a chat with @userinfobot
2. Send any message
3. It replies with your user ID (a number like `123456789`)

Ask them to share the user ID. This restricts who can talk to the bot.

**Wait for the user ID before continuing.**

---

## Step 3: Set Up API Key

Check the pre-flight results:

**If ANTHROPIC_KEY_SET:** "Your Anthropic API key is already configured. Good to go."

**If ANTHROPIC_KEY_MISSING:** Ask if they have an Anthropic API key. If yes, collect it. If no, explain they can use Ollama for a free local model instead (the gateway auto-detects it).

---

## Step 4: Write Secrets to Shell Profile

**Ask for explicit permission before modifying their shell profile.**

Using the shell profile detected in pre-flight (`~/.zshrc` or `~/.bashrc`):

```
I'd like to add these environment variables to [shell profile]:

export TELEGRAM_BOT_TOKEN="[token from step 1]"
export ANTHROPIC_API_KEY="[key from step 3]"    # only if they provided one

Can I go ahead and add these?
```

If approved, append to the shell profile. Use `>>` (append), never `>` (overwrite). Check if the exports already exist first to avoid duplicates:

```bash
# Check for existing entries before appending
grep -q 'TELEGRAM_BOT_TOKEN' [SHELL_PROFILE] 2>/dev/null && echo "TELEGRAM_EXISTS" || echo "TELEGRAM_NEW"
grep -q 'ANTHROPIC_API_KEY' [SHELL_PROFILE] 2>/dev/null && echo "ANTHROPIC_EXISTS" || echo "ANTHROPIC_NEW"
```

Only append lines that don't already exist. If an entry exists, tell the user and ask if they want to update it.

After writing, source the profile:
```bash
source [SHELL_PROFILE]
```

---

## Step 5: Write gateway.json

Check if `~/.claudia/gateway.json` already exists (from pre-flight). If it does, merge new values. If not, create it.

Build the config with these values:

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "allowedUsers": ["USER_ID_FROM_STEP_2"]
    }
  }
}
```

**Ask permission before writing:**

```
I'll write this gateway config to ~/.claudia/gateway.json:

[show the JSON]

The bot token and API key are loaded from environment variables (not stored in this file).
Want me to write it?
```

If an existing config has other settings (Slack, custom model, etc.), preserve them. Use a merge approach: read existing, overlay new values, write back.

Write the file:
```bash
cat > ~/.claudia/gateway.json << 'GATEWAY_EOF'
[merged JSON]
GATEWAY_EOF
```

---

## Step 6: Start and Verify

Start the gateway:

```bash
source ~/.zshrc 2>/dev/null || source ~/.bashrc 2>/dev/null
nohup node ~/.claudia/gateway/src/index.js start > /tmp/claudia-gateway.log 2>&1 &
echo "STARTED_PID:$!"
```

Wait and verify:

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

**If verified:** Tell the user to send a message to their bot on Telegram to test it.

**If failed:** Show the error from the log and suggest fixes:
- Missing token: re-check shell profile sourcing
- Port conflict: another gateway instance may be running (`/gateway stop` first)
- Missing dependencies: `cd ~/.claudia/gateway && npm install`

---

## After Setup

Once the bot responds on Telegram:

```
You're all set! Your Telegram bot is live.

A few things to know:
- The gateway uses Haiku by default (fast and affordable for chat)
- Messages go through your memory system, so Claudia remembers conversations
- Manage the gateway anytime with `/gateway start`, `/gateway stop`, `/gateway status`
- Config lives in ~/.claudia/gateway.json (secrets stay in env vars)
```

---

## Tone

- One step at a time. Confirm before moving on.
- Don't over-explain what the gateway is. The user asked to set it up, so they know.
- Be specific about what you're writing and where.
- Always ask before modifying shell profiles or config files.
