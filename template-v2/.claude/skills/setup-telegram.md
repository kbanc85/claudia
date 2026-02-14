---
name: setup-telegram
description: Guided walkthrough for setting up Telegram bot integration. Creates bot via BotFather, configures relay or gateway, tests messaging. Use when user says "set up telegram", "connect telegram", "telegram bot".
effort-level: medium
---

# Setup Telegram

Guided walkthrough for connecting Claudia to Telegram. Two paths available:

- **Gateway** (lighter): API-based chat, fast responses, tool use supported
- **Relay** (full): Full `claude -p` agent sessions with all skills and memory access

## When to Use

- User wants to message Claudia via Telegram
- User says "set up telegram", "connect telegram", "telegram bot"

## Process

### Step 1: Create Telegram Bot

Walk the user through BotFather:

1. Open Telegram and search for `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g., "Claudia Assistant")
4. Choose a username (must end in `bot`, e.g., `claudia_assistant_bot`)
5. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

**Important:** The token is sensitive. Don't share it publicly.

### Step 2: Choose Integration Path

Ask the user:

"There are two ways to connect Telegram:

**Gateway** (recommended for most users):
- Faster responses (direct API calls)
- Tool use (memory read/write)
- Lighter resource usage
- Requires: API key (Anthropic or Ollama)

**Relay** (for power users):
- Full Claude Code agent sessions
- All skills and commands available
- File handling (photos, documents)
- Requires: Claude Code CLI installed

Which would you prefer?"

### Step 3a: Gateway Path

1. Set the bot token in environment:
   ```bash
   export TELEGRAM_BOT_TOKEN="your-token-here"
   ```
   Or add to `~/.claudia/gateway/gateway.json`:
   ```json
   {
     "channels": {
       "telegram": {
         "enabled": true,
         "token": "your-token-here"
       }
     }
   }
   ```

2. If gateway not installed yet, run `/setup-gateway` first

3. Start the gateway: `/gateway start`

### Step 3b: Relay Path

1. Set the bot token in environment:
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export TELEGRAM_BOT_TOKEN="your-token-here"
   ```

2. Verify Claude Code CLI is available:
   ```bash
   claude --version
   ```

3. Configure relay in `~/.claudia/relay/config.json`:
   ```json
   {
     "telegram": {
       "enabled": true
     }
   }
   ```

4. Start the relay:
   ```bash
   cd ~/.claudia/relay && node telegram.js
   ```

### Step 4: Test

1. Open Telegram
2. Find your bot by searching its username
3. Send a test message: "Hello, Claudia"
4. Verify response comes back

### Step 5: Set Up Auto-Start (Optional)

**macOS (launchd):**
```bash
# Create plist for auto-start on login
cat > ~/Library/LaunchAgents/com.claudia.telegram.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claudia.telegram</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>gateway.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>~/.claudia/gateway</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
launchctl load ~/Library/LaunchAgents/com.claudia.telegram.plist
```

**Linux (systemd):**
```bash
# Create user service
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/claudia-telegram.service << 'EOF'
[Unit]
Description=Claudia Telegram Integration

[Service]
WorkingDirectory=%h/.claudia/gateway
ExecStart=/usr/bin/node gateway.js
Restart=always

[Install]
WantedBy=default.target
EOF
systemctl --user enable claudia-telegram
systemctl --user start claudia-telegram
```

### Step 6: Confirm

```
**Telegram Setup Complete**

✓ Bot: @{{bot_username}}
✓ Path: {{gateway or relay}}
✓ Status: Connected and responding

Send a message to your bot anytime to chat with Claudia.
Check status with `/gateway status`
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot doesn't respond | Check token is correct, gateway/relay is running |
| "Unauthorized" error | Token may be invalid. Create a new bot with BotFather |
| Slow responses | Gateway path is faster than relay. Consider switching. |
| Photos not working | Only supported via relay path (not gateway) |
