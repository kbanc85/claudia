---
name: gateway
description: Start, stop, or check status of the Claudia Gateway service for Telegram and Slack messaging integration. Use when user says "gateway status", "start gateway", "stop gateway".
effort-level: low
---

# Gateway

Manage the Claudia Gateway service for messaging integrations (Telegram, Slack, webhooks).

## Usage

- `/gateway` or `/gateway status` - Check status
- `/gateway start` - Start the gateway
- `/gateway stop` - Stop the gateway

## Process

### Status Check

1. **Check if gateway is installed:**
   ```bash
   ls ~/.claudia/gateway/package.json 2>/dev/null
   ```
   If missing: "Gateway not installed. Run `/setup-gateway` to set it up."

2. **Check if process is running:**

   **macOS/Linux:**
   ```bash
   ps aux | grep "claudia.*gateway" | grep -v grep
   # Also check the PID file if it exists
   cat ~/.claudia/gateway/gateway.pid 2>/dev/null
   ```

   **Windows:**
   ```powershell
   Get-Process node* -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*gateway*' }
   ```

3. **Check config:**
   ```bash
   cat ~/.claudia/gateway/gateway.json 2>/dev/null
   ```
   Report which channels are configured (Telegram, Slack, webhook).

4. **Test connectivity (if running):**
   ```bash
   curl -s http://localhost:3849/health 2>/dev/null || echo "Not responding"
   ```

### Report

```
**Gateway Status**

| Component | Status |
|-----------|--------|
| Installed | ✅/❌ |
| Process | ✅ Running (PID xxx) / ❌ Stopped |
| Config | [channels configured] |
| Health | ✅/❌ |

[If issues, suggest specific fixes]
```

### Start

1. Verify gateway is installed and configured
2. Run:

   **macOS/Linux:**
   ```bash
   cd ~/.claudia/gateway && node gateway.js &
   ```

   **Windows:**
   ```powershell
   Start-Process -NoNewWindow node -ArgumentList "$env:USERPROFILE\.claudia\gateway\gateway.js"
   ```

3. Wait 2 seconds, then verify with health check
4. Report success or failure

### Stop

1. Find the process:

   **macOS/Linux:**
   ```bash
   pkill -f "claudia.*gateway"
   ```

   **Windows:**
   ```powershell
   Get-Process node* | Where-Object { $_.CommandLine -like '*gateway*' } | Stop-Process
   ```

2. Verify it stopped
3. Report confirmation

## Common Issues

| Issue | Fix |
|-------|-----|
| "ANTHROPIC_API_KEY not set" | Set the key in gateway.json or environment |
| "TELEGRAM_BOT_TOKEN not set" | Run `/setup-telegram` to configure |
| Port 3849 in use | Check what's using it: `lsof -i :3849` |
| Gateway crashes on start | Check logs: `~/.claudia/gateway/gateway.log` |
