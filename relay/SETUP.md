# Claudia Relay -- Setup Guide

## What This Does

The relay connects your Telegram to Claude Code. When you send a message on Telegram, the relay passes it to `claude -p` (Claude's headless mode), which runs with all of Claudia's personality, memory, and skills. The response comes back to your Telegram chat.

---

## Step 1: Create a Telegram Bot

You need a bot token from Telegram.

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Give it a name (e.g., "Claudia Assistant")
4. Give it a username (e.g., `claudia_yourname_bot` -- must end in `bot`)
5. BotFather will reply with a **token** that looks like: `7123456789:AAH1bGciOiJIUzI1NiIs...`
6. **Copy that token** -- you'll need it in Step 4

## Step 2: Find Your Telegram User ID

The relay needs your Telegram user ID to make sure only YOU can talk to the bot (otherwise anyone who finds your bot could use it).

1. Open Telegram and search for **@userinfobot**
2. Send it any message
3. It replies with your **Id** -- a number like `123456789`
4. **Copy that number**

## Step 3: Install the Relay Dependencies

Open your terminal and run:

```bash
cd claudia/relay
npm install
```

This downloads the `grammy` library (the Telegram bot framework). You only need to do this once. You'll see output ending with something like "added 10 packages".

## Step 4: Create the Config File

The relay needs to know two things: where your Claudia install lives, and who's allowed to use the bot.

Run this command, but **replace the placeholder values** with your real ones:

```bash
mkdir -p ~/.claudia

cat > ~/.claudia/relay.json << 'EOF'
{
  "claudiaDir": "/Users/you/path/to/your/claudia-install",
  "telegram": {
    "allowedUsers": ["YOUR_TELEGRAM_USER_ID"]
  },
  "claude": {
    "permissionMode": "plan"
  },
  "session": {
    "ttlMinutes": 30
  }
}
EOF
```

**What to change:**

- `claudiaDir` -- the folder where your Claudia lives (where `CLAUDE.md` is). This is the directory you normally `cd` into before running `claude`. For example: `"/Users/you/claudia"` or wherever you installed Claudia with `npx get-claudia`.
- `allowedUsers` -- put your Telegram user ID from Step 2 inside the quotes. Keep the brackets.

**What `permissionMode` means:** This controls what Claude is allowed to do without asking. `"plan"` means Claude will plan actions but ask before executing anything risky (like running bash commands or editing files). This is the safest option for remote use.

## Step 5: Start the Relay

```bash
TELEGRAM_BOT_TOKEN="your-token-here" node claudia/relay/src/index.js start
```

**Replace `your-token-here`** with the bot token from Step 1.

You should see output like:

```
[relay] Claudia Relay started
[relay]   claudiaDir: /Users/you/...
[relay]   permission mode: plan
[relay]   session TTL: 30 min
[relay]   allowed users: 1
[relay:telegram] Telegram bot started
```

The relay is now running. **Keep this terminal window open** -- closing it stops the relay.

## Step 6: Talk to Claudia on Telegram

1. Open Telegram
2. Find your bot (search for the username you chose in Step 1)
3. Send a message like "Hi Claudia, what can you help me with?"
4. Wait -- the first response takes 10-30 seconds because Claude is starting up
5. You'll see "typing..." in the chat while Claude works

## Step 7: Stop the Relay

When you're done, press **Ctrl+C** in the terminal where the relay is running. You'll see:

```
[relay] Received SIGINT, shutting down...
[relay:telegram] Telegram bot stopped
[relay] Claudia Relay stopped
```

---

## Quick Reference (After Setup)

Once everything is configured, starting the relay each day is just:

```bash
TELEGRAM_BOT_TOKEN="your-token" node claudia/relay/src/index.js start
```

**Tip:** To avoid typing the token every time, add it to your shell profile:

```bash
echo 'export TELEGRAM_BOT_TOKEN="your-token-here"' >> ~/.zshrc
source ~/.zshrc
```

Then you can just run:

```bash
node claudia/relay/src/index.js start
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `claude CLI not found in PATH` | Claude Code isn't installed. Run `npm install -g @anthropic-ai/claude-code` |
| `claudiaDir does not exist` | The path in `relay.json` is wrong. Check it points to your Claudia install folder |
| `Telegram bot token required` | You forgot to set `TELEGRAM_BOT_TOKEN` or the token is invalid |
| Bot doesn't respond | Check the terminal for errors. Make sure the relay is still running |
| `Another relay instance is running` | A previous relay didn't shut down cleanly. Run `node .../index.js stop` first, or delete `~/.claudia/relay.pid` |
| Response says "Sorry, I'm not configured to chat with you" | Your Telegram user ID in `relay.json` doesn't match. Double-check with @userinfobot |

---

## How It Works (Under the Hood)

```
You (Telegram) --> Grammy bot --> claude -p (headless CLI) --> Response back to Telegram
```

The relay sets `cwd` to your `claudiaDir` when spawning `claude -p`. Claude Code then automatically reads:

- **CLAUDE.md** -- Claudia's personality
- **.mcp.json** -- Memory daemon connection
- **.claude/skills/** -- All skills
- **.claude/rules/** -- Principles
- **.claude/hooks/** -- Health checks

No special configuration needed. If it works when you run `claude` locally in that directory, it works through Telegram.

Sessions last 30 minutes by default. Within that window, each message continues the same conversation (Claude remembers what you said earlier). After 30 minutes of silence, a fresh session starts.
