---
name: setup-telegram
description: Guided walkthrough for setting up the Claudia Telegram relay. Helps create a Telegram bot, configure relay.json, and start the service.
effort-level: medium
---

# Telegram Relay Setup

**Triggers:** "set up Telegram", "configure Telegram", "Telegram relay", "connect Telegram", "Telegram bot"

---

## Pre-Flight Checks

Before starting the walkthrough, check current state:

```
1. Does ~/.claudia/relay.json exist?
   ├── YES → Read it, note what's already configured
   └── NO  → Will need to create it

2. Does relay/node_modules/grammy exist? (relative to Claudia install)
   ├── YES → Dependencies installed, skip step 3
   └── NO  → Will need npm install

3. Is TELEGRAM_BOT_TOKEN set in the environment?
   ├── YES → Token configured, skip step 5
   └── NO  → Will need to set it
```

Use these checks to skip steps that are already done. Tell the user what you found: "Looks like you already have relay.json set up. Let me check what's in it..."

---

## Walkthrough

Present **one step at a time**. Confirm the user has completed each step before moving to the next. Keep the tone conversational, not like a manual.

### Step 1: Create a Telegram Bot

Ask the user to open Telegram and talk to **@BotFather**:

1. Send `/newbot` to @BotFather
2. Choose a display name (e.g., "Claudia")
3. Choose a username ending in `bot` (e.g., `claudia_assistant_bot`)
4. Copy the bot token @BotFather gives you

Tell them: "Don't share the token with me in chat. We'll put it in an environment variable in step 5."

**Wait for confirmation before continuing.**

### Step 2: Find Your Telegram User ID

Ask the user to message **@userinfobot** on Telegram:

1. Open a chat with @userinfobot
2. Send any message
3. It replies with your user ID (a number like `123456789`)

Ask them to share the user ID. This goes in the config file to restrict who can talk to the bot.

**Wait for the user ID before continuing.**

### Step 3: Install Relay Dependencies

Skip if `relay/node_modules/grammy` already exists.

Run:
```bash
cd <claudia-install-dir>/relay && npm install
```

Where `<claudia-install-dir>` is the path to their Claudia installation (the directory containing CLAUDE.md).

### Step 4: Create Config File

Skip if `~/.claudia/relay.json` already exists with valid content.

After collecting the Claudia install directory path and user ID, offer to write the config:

```json
{
  "claudiaDir": "/path/to/claudia-install",
  "telegram": {
    "allowedUsers": ["TELEGRAM_USER_ID"]
  },
  "claude": {
    "permissionMode": "plan"
  },
  "session": {
    "ttlMinutes": 30
  }
}
```

Fields:
- `claudiaDir` - Absolute path to the directory containing CLAUDE.md (where `claude -p` runs)
- `telegram.allowedUsers` - Array of Telegram user ID strings (from step 2)
- `claude.permissionMode` - How Claude handles tool permissions (`plan` is recommended)
- `session.ttlMinutes` - How long a conversation session stays alive between messages

**Ask if they want you to write this file.** Confirm the paths look correct before writing.

### Step 5: Set Bot Token

The token goes in an environment variable, not the config file.

Suggest adding to their shell profile (`~/.zshrc`, `~/.bashrc`, or `~/.bash_profile`):

```bash
export TELEGRAM_BOT_TOKEN="<token-from-botfather>"
```

Then reload the shell: `source ~/.zshrc` (or equivalent).

Tell them: "The relay reads `TELEGRAM_BOT_TOKEN` from the environment at startup. Keeping it out of relay.json means it won't accidentally end up in version control."

### Step 6: Start the Relay

```bash
cd <claudia-install-dir> && node relay/src/index.js start
```

The relay starts a long-polling connection to Telegram. They should see log output confirming the bot is running.

For background operation, suggest:
```bash
nohup node relay/src/index.js start > ~/.claudia/relay.log 2>&1 &
```

### Step 7: Test It

Ask them to send a message to their bot on Telegram. Something simple like "Hey Claudia, are you there?"

If it works, they should see a response within a few seconds. If not, check:
- Is the relay process running?
- Is `TELEGRAM_BOT_TOKEN` set correctly?
- Does `relay.json` have the right `claudiaDir` path?
- Is Claude Code (`claude` CLI) installed and in PATH?

---

## After Setup

Once everything is working, mention:

- The relay spawns `claude -p` for each message, so Claudia has full access to skills, memory, and MCP tools
- Files sent via Telegram (photos, documents) are downloaded and passed to Claude for processing
- Claudia can send files back by creating them and mentioning the absolute path in her response
- Sessions persist for `ttlMinutes` (default 30), so follow-up messages have conversation context
- Multiple users can be added to `allowedUsers` in relay.json
