---
name: setup-gateway
description: Guided walkthrough for setting up the Claudia Gateway service (API-based chat for Telegram, Slack, webhooks). Use when user says "set up gateway", "configure gateway", "install gateway".
effort-level: medium
---

# Setup Gateway

Guided walkthrough for setting up the Claudia Gateway, which provides API-based chat integrations (Telegram, Slack, webhooks). The gateway is a lighter, faster alternative to the full relay (which uses `claude -p` agent sessions).

## When to Use

- User wants to chat with Claudia via Telegram or Slack
- User wants to set up webhook integrations
- User says "set up gateway" or "configure messaging"

## Prerequisites

- Node.js 18+ installed
- An API key for the LLM provider (Anthropic or Ollama)
- For Telegram: a bot token from BotFather
- For Slack: a Slack app with appropriate permissions

## Process

### Step 1: Check Existing Installation

```bash
ls ~/.claudia/gateway/package.json 2>/dev/null && echo "Gateway already installed" || echo "Fresh install needed"
```

If already installed, ask if user wants to reconfigure or start from scratch.

### Step 2: Install Dependencies

```bash
# Create gateway directory
mkdir -p ~/.claudia/gateway
cd ~/.claudia/gateway

# Initialize and install dependencies
npm init -y
npm install grammy         # Telegram SDK
```

### Step 3: Configure gateway.json

Create `~/.claudia/gateway/gateway.json`:

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20250929",
  "channels": {
    "telegram": {
      "enabled": false,
      "token": ""
    },
    "webhook": {
      "enabled": false,
      "port": 3849,
      "secret": ""
    }
  },
  "toolUse": true,
  "preRecall": true
}
```

Walk the user through each field:

1. **Provider:** "Which LLM provider? Anthropic (recommended) or Ollama (local)?"
2. **Model:** Suggest defaults based on provider
3. **Channels:** "Which channels do you want to enable?"

### Step 4: Set API Keys

Guide the user to set their API key:

**For Anthropic:**
```bash
# Add to shell profile (~/.zshrc or ~/.bashrc)
export ANTHROPIC_API_KEY="sk-ant-..."
```

**For Ollama:**
```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags
```

### Step 5: Enable Channels

For each channel the user wants:

**Telegram:** Point them to `/setup-telegram` for the BotFather walkthrough.

**Webhook:** Generate a random secret:
```bash
openssl rand -hex 32
```
Add to gateway.json. Provide the endpoint URL: `http://localhost:3849/webhook`

### Step 6: Test

```bash
cd ~/.claudia/gateway && node gateway.js
```

Verify:
- Gateway starts without errors
- Health endpoint responds: `curl http://localhost:3849/health`
- Send a test message via configured channel

### Step 7: Confirm

```
**Gateway Setup Complete**

✓ Provider: {{provider}} ({{model}})
✓ Channels: {{enabled_channels}}
✓ Health endpoint: http://localhost:3849/health

Start the gateway anytime with `/gateway start`
Check status with `/gateway status`
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| npm install fails | Check Node.js version: `node --version` (need 18+) |
| API key not found | Restart terminal after adding to shell profile |
| Port already in use | Change port in gateway.json or stop other process |
| Telegram not connecting | Verify token with `/setup-telegram` |
