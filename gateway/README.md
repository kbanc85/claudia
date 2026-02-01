# Claudia Gateway

The messaging gateway lets you talk to Claudia from Telegram and Slack on your phone or desktop. Messages flow from your chat app to the gateway running on your machine, where they're processed with full access to Claudia's memory system. You can use a local Ollama model (completely offline) or the Anthropic API (Claude).

## Provider

The gateway auto-detects which LLM provider to use at startup:

1. **Anthropic (cloud)** -- If `ANTHROPIC_API_KEY` is set, uses the Anthropic API with the configured Claude model.
2. **Ollama (local)** -- If no API key is set, uses the local Ollama model from `~/.claudia/config.json`. This is the same model you picked during memory daemon setup (qwen3:4b, smollm3:3b, or llama3.2:3b).

No manual `provider` field needed. The gateway figures it out.

## Quick Start

### Local-only (no API key needed)

1. Run the installer (done automatically via `npx get-claudia`):
   ```bash
   bash gateway/scripts/install.sh
   ```
   The installer will offer to pull a local model if Ollama is installed.

2. Set your chat platform token:
   ```bash
   export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   ```

3. Edit `~/.claudia/gateway.json` to enable your channel and set your user ID:
   ```json
   {
     "channels": {
       "telegram": {
         "enabled": true,
         "allowedUsers": ["YOUR_TELEGRAM_USER_ID"]
       }
     }
   }
   ```

4. Start the gateway:
   ```bash
   claudia-gateway start
   ```

### With Anthropic API

Same as above, but also set:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```
When an API key is present, the gateway uses Claude instead of the local model.

## Telegram Setup

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts to create your bot
3. Copy the bot token BotFather gives you
4. Get your Telegram user ID (message [@userinfobot](https://t.me/userinfobot) or check in Telegram settings)
5. Set environment variables:
   ```bash
   export TELEGRAM_BOT_TOKEN="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
   ```
6. Edit `~/.claudia/gateway.json`:
   ```json
   {
     "channels": {
       "telegram": {
         "enabled": true,
         "allowedUsers": ["123456789"]
       }
     }
   }
   ```
7. Start the gateway: `claudia-gateway start`
8. Open your bot in Telegram and send a message

## Slack Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App** > **From scratch**
2. Enable **Socket Mode** under Settings (generates an app-level token starting with `xapp-`)
3. Under **OAuth & Permissions**, add these bot token scopes:
   - `app_mentions:read`
   - `chat:write`
   - `im:history`
   - `im:read`
   - `im:write`
4. Under **Event Subscriptions**, enable events and subscribe to:
   - `message.im`
   - `app_mention`
5. Install the app to your workspace (generates a bot token starting with `xoxb-`)
6. Set environment variables:
   ```bash
   export SLACK_BOT_TOKEN="xoxb-..."
   export SLACK_APP_TOKEN="xapp-..."
   ```
7. Edit `~/.claudia/gateway.json`:
   ```json
   {
     "channels": {
       "slack": {
         "enabled": true,
         "allowedUsers": ["U01ABCDEF"]
       }
     }
   }
   ```
8. Start the gateway: `claudia-gateway start`
9. DM the bot or mention it in a channel

## Configuration Reference

Config lives at `~/.claudia/gateway.json`. All API keys/tokens should be set as environment variables, not stored in this file.

| Key | Env Override | Description |
|-----|-------------|-------------|
| `anthropicApiKey` | `ANTHROPIC_API_KEY` | Your Anthropic API key (optional if using Ollama) |
| `model` | | Claude model to use (default: `claude-sonnet-4-20250514`) |
| `maxTokens` | | Max response tokens (default: `2048`) |
| `ollama.host` | `OLLAMA_HOST` | Ollama server URL (default: `http://localhost:11434`) |
| `ollama.model` | | Ollama model name; auto-detected from `~/.claudia/config.json` |
| `channels.telegram.enabled` | | Enable Telegram adapter |
| `channels.telegram.token` | `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `channels.telegram.allowedUsers` | | Array of allowed Telegram user IDs |
| `channels.slack.enabled` | | Enable Slack adapter |
| `channels.slack.botToken` | `SLACK_BOT_TOKEN` | Bot OAuth token (`xoxb-...`) |
| `channels.slack.appToken` | `SLACK_APP_TOKEN` | App-level token (`xapp-...`) |
| `channels.slack.signingSecret` | `SLACK_SIGNING_SECRET` | Slack signing secret |
| `channels.slack.allowedUsers` | | Array of allowed Slack user IDs |
| `globalAllowedUsers` | | User IDs allowed across all channels |
| `proactive.enabled` | | Enable proactive notifications |
| `proactive.pollIntervalMs` | | How often to check for notifications (ms) |
| `proactive.defaultChannel` | | Channel for proactive messages |
| `proactive.defaultUserId` | | User to receive proactive messages |
| `memoryDaemon.healthPort` | | Memory daemon health port (default: `3848`) |
| `gateway.port` | | Gateway service port (default: `3849`) |
| `gateway.logLevel` | | Log level: `debug`, `info`, `warn`, `error` |

## Security

### Deny-by-default allowlist

The gateway rejects all messages from users not in the `allowedUsers` array. No allowlist entries = nobody can talk to your Claudia. This is the primary security boundary.

Per-channel `allowedUsers` and `globalAllowedUsers` are both checked. A user must appear in at least one to be authorized.

### API key handling

- **Environment variables only.** The `saveConfig` function actively strips secrets before writing `gateway.json` to disk. Even if you put a token in the JSON, it gets removed on next save.
- Supported env vars: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_SIGNING_SECRET`
- Never commit `.env` files or gateway.json with tokens to version control.

### Data flow

**With Anthropic API:**
```
Phone/Desktop                Your Machine                  Cloud
┌──────────┐    encrypted    ┌──────────────────┐         ┌───────────┐
│ Telegram  │───(TLS)──────▶│  Claudia Gateway  │──────▶│ Anthropic  │
│ or Slack  │◀──(TLS)───────│  (localhost)       │◀──────│ API        │
└──────────┘                 │                    │         └───────────┘
                             │  ┌──────────────┐ │
                             │  │ Memory Daemon │ │
                             │  │ (localhost)   │ │
                             │  └──────────────┘ │
                             └──────────────────────┘
```

**With Ollama (fully local):**
```
Phone/Desktop                Your Machine
┌──────────┐    encrypted    ┌──────────────────┐
│ Telegram  │───(TLS)──────▶│  Claudia Gateway  │
│ or Slack  │◀──(TLS)───────│  (localhost)       │
└──────────┘                 │                    │
                             │  ┌──────────────┐ │
                             │  │ Ollama LLM    │ │
                             │  │ Memory Daemon │ │
                             │  │ (localhost)   │ │
                             │  └──────────────┘ │
                             └──────────────────────┘
```

- **Your message** travels from your chat app through the platform's servers (Telegram/Slack) to the gateway running on your machine.
- **The gateway** processes your message locally, reads/writes to Claudia's memory (local SQLite), and calls either the Anthropic API or local Ollama model.
- **With Ollama**, no data leaves your machine except through the chat platform routing. The LLM runs entirely on your hardware.
- **Memory stays local.** The memory daemon stores data in `~/.claudia/memory/` and never sends data to any external service.

### What goes where

| Data | Where it goes |
|------|--------------|
| Your messages | Telegram/Slack servers (platform routing), Anthropic API or local Ollama |
| LLM responses | Anthropic API or local Ollama, Telegram/Slack servers (delivery) |
| Memory (facts, entities, relationships) | Local SQLite only (`~/.claudia/memory/`) |
| API keys | Environment variables on your machine only |
| Gateway config | `~/.claudia/gateway.json` on your machine (secrets stripped) |
| Logs | `~/.claudia/gateway.log` on your machine |

## CLI Commands

```bash
claudia-gateway start [--channels telegram,slack] [--debug]
claudia-gateway stop
claudia-gateway status
claudia-gateway logs [--lines N]
claudia-gateway init
```

| Command | Description |
|---------|-------------|
| `start` | Start the gateway. Use `--channels` to override which channels to enable. Use `--debug` for verbose logging. |
| `stop` | Send SIGTERM to the running gateway process. |
| `status` | Show whether the gateway is running, which channels are configured, and memory daemon health. |
| `logs` | Print the last N lines from the gateway log (default: 50). |
| `init` | Generate an example `~/.claudia/gateway.json` config file. |

## Proactive Notifications

Claudia can send you messages unprompted when she detects something worth flagging (overdue commitments, meeting reminders, pattern alerts).

To enable:

1. Edit `~/.claudia/gateway.json`:
   ```json
   {
     "proactive": {
       "enabled": true,
       "defaultChannel": "telegram",
       "defaultUserId": "YOUR_USER_ID"
     }
   }
   ```

2. The gateway polls the memory daemon for pending predictions and notifications at the configured interval (default: 5 minutes).

3. Requires the memory daemon to be running and healthy.

## Architecture: Gateway vs Claude Code

The gateway and Claude Code are independent systems that share the same memory:

```
┌─────────────────────────┐    ┌──────────────────────────┐
│  Claude Code (terminal)  │    │  Gateway (Telegram/Slack) │
│                          │    │                           │
│  Claude (Anthropic API)  │    │  Ollama OR Anthropic API  │
│  Full MCP toolset        │    │  Memory tools only        │
│  File access, skills     │    │  Chat-optimized responses │
└────────────┬─────────────┘    └─────────────┬────────────┘
             │                                 │
             └──────────┐  ┌───────────────────┘
                        ▼  ▼
               ┌──────────────────┐
               │  Memory Daemon   │
               │  (shared SQLite) │
               └──────────────────┘
```

Key points:
- **Separate LLMs.** Claude Code always uses the Anthropic API (Claude). The gateway uses whichever provider is available: Anthropic if you have an API key, or a local Ollama model if you don't.
- **Shared memory.** Both read and write to the same memory daemon. A fact remembered in Claude Code is available in Telegram, and vice versa.
- **Different tool access.** Claude Code has the full toolset (files, skills, commands, MCP servers). The gateway only has memory tools, keeping responses fast and focused for chat.

## MCP Server Troubleshooting

If MCP servers (Brave Search, Gmail, etc.) fail to connect or time out, try these fixes:

### Option A: Install globally (most reliable)

`npx` can be flaky with MCP servers because it downloads on every launch. Installing globally avoids this:

```bash
npm install -g @anthropics/mcp-server-brave-search
npm install -g @modelcontextprotocol/server-google-calendar
```

Then update `.mcp.json` to use the global binary directly:

```json
{
  "brave-search": {
    "command": "mcp-server-brave-search",
    "env": { "BRAVE_API_KEY": "your-key" }
  }
}
```

### Option B: Use full paths instead of npx

Find where npm installs global packages and use the absolute path:

```bash
# Find global bin directory
npm config get prefix
# e.g. /usr/local or /Users/you/.nvm/versions/node/v22.x.x

# Use full path in .mcp.json
{
  "brave-search": {
    "command": "/usr/local/bin/mcp-server-brave-search",
    "env": { "BRAVE_API_KEY": "your-key" }
  }
}
```

### Option C: Reconnect workaround

If a server shows as disconnected in Claude Code:
1. Open the `/mcp` menu
2. Select the server and try reconnecting
3. If it fails, try a second time (race condition in npx startup)
4. Avoid `/mcp reconnect` (reconnects all servers simultaneously, which can cause timeouts)

## Troubleshooting

**Gateway won't start**
- Check Node.js version: `node --version` (must be 18+)
- Verify a provider is available: `echo $ANTHROPIC_API_KEY` or `ollama list`
- Check config: `cat ~/.claudia/gateway.json`
- Check shared config: `cat ~/.claudia/config.json` (should have `language_model`)
- Look at logs: `claudia-gateway logs --lines 100`

**Bot doesn't respond**
- Verify the bot token is correct
- Check that your user ID is in `allowedUsers`
- Run with `--debug` for detailed logs: `claudia-gateway start --debug`

**Memory not available**
- Check memory daemon: `curl http://localhost:3848/health`
- The gateway works without memory (just no persistent context)

**Auto-start**
- macOS: `launchctl load ~/Library/LaunchAgents/com.claudia.gateway.plist`
- Linux: `systemctl --user enable --now claudia-gateway`
- Windows: `Enable-ScheduledTask -TaskName ClaudiaGateway`

**Reinstall**
- Run the installer again with upgrade mode:
  ```bash
  CLAUDIA_GATEWAY_UPGRADE=1 bash ~/.claudia/gateway/scripts/install.sh
  ```
