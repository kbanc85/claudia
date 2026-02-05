---
name: connector-discovery
description: Help users connect their external tools in a gentle, non-technical way. Recommend solutions based on what works best, explain everything in plain language.
effort-level: high
---

# Connector Discovery Skill

**Triggers:**
- Invoked during onboarding Phase 3.5 (after archetype detection)
- Invoked by capability-suggester when user mentions external tools repeatedly
- User directly asks about connecting services ("can you see my email?")

---

## Priority Order

Always recommend in this order (most reliable first):

| Priority | Type | Plain-Language Name | Why |
|----------|------|---------------------|-----|
| 1 | CLI | "Built-in tools" | Already installed, most reliable |
| 2 | API | "Direct connection" | Simple, official when available |
| 3 | MCP | "Extension" | Feature-rich, requires setup |
| 4 | Browser | "Browser assist" | Last resort for web-only tools |

---

## Discovery Flow

### During Onboarding (Phase 3.5)

Transition naturally after archetype detection. Use tools they mentioned in Phase 2.

**Opening (reference their tools):**
```
"By the way-you mentioned using [tools from Phase 2]. Want me to
see if I can connect to any of those? I can also help with email,
calendar, and file access if that would be useful."
```

**Responses:**
- **"Yes"** → Continue with discovery questions below
- **"Not right now"** → "No problem-just ask anytime." Continue to Phase 4.
- **Specific interest** → Focus on that tool

**Discovery Questions (if interested):**
```
"What would be most useful? For example:
• Reading and drafting emails
• Seeing your calendar in morning briefs
• Accessing files in specific folders
• Something else?"
```

### Post-Onboarding (On Demand)

When invoked later (via capability-suggester or direct request):

**Opening:**
```
"I can connect to various tools to help you more. What were you
thinking? Email, calendar, files, or something specific?"
```

---

## Integration Map

Common tools and recommended approaches:

### Email

| Service | Recommendation | Notes |
|---------|----------------|-------|
| Gmail | MCP: `@gongrzhe/server-gmail-autoauth-mcp` | Read, draft, search emails |
| Outlook | MCP: Check mcp.so | Microsoft Graph API |
| Other | Browser assist | Last resort |

**Plain language:**
> "For Gmail, I'd connect through Google's official channel. I can read
> your emails, draft replies, and include email context in morning briefs.
> Setup takes about 5 minutes-you'll approve access in your browser."

### Calendar

| Service | Recommendation | Notes |
|---------|----------------|-------|
| Google Calendar | MCP: `@modelcontextprotocol/server-google-calendar` | View events, scheduling |
| Outlook Calendar | MCP: Check mcp.so | Microsoft Graph |
| Apple Calendar | No good option | Explain limitation |

**Plain language:**
> "For Google Calendar, I can see your schedule and include today's
> meetings in your morning brief. One-time setup, about 5 minutes."

### Files

| Service | Recommendation | Notes |
|---------|----------------|-------|
| Local files | MCP: `@anthropics/mcp-server-filesystem` | Specify allowed folders |
| Google Drive | CLI: `rclone` (preferred) | Or MCP server |
| Dropbox | CLI: `rclone` | Sync-based access |
| OneDrive | CLI: `rclone` | Microsoft cloud |

**Plain language:**
> "For local files, I can access specific folders you choose-nothing
> else. You'll tell me exactly which folders are okay to read."

### Code & Development

| Service | Recommendation | Notes |
|---------|----------------|-------|
| GitHub | CLI: `gh` (preferred) | Already likely installed |
| GitLab | CLI: `glab` | Similar to gh |
| Linear | MCP: Check mcp.so | Issue tracking |
| Jira | MCP: Community servers | Enterprise |

**Plain language:**
> "For GitHub, there's a built-in tool that's probably already on
> your system. I can check issues, PRs, and repo info. Want me to
> see if it's set up?"

### Productivity

| Service | Recommendation | Notes |
|---------|----------------|-------|
| Notion | MCP: Check mcp.so/GitHub | Community maintained |
| Slack | MCP: Check mcp.so | Messaging |
| Todoist | MCP: Check mcp.so | Task management |
| Obsidian | Local files | Use filesystem MCP |

### Search & Research

| Service | Recommendation | Notes |
|---------|----------------|-------|
| Web search (free) | Built-in WebSearch/WebFetch | Already available, zero setup |
| Web search (free) | MCP: `@mcp-server/web-search` | DuckDuckGo, no API key |
| Page fetch (free) | MCP: `@anthropics/mcp-server-fetch` | Clean web content, no API key |
| Brave Search | MCP: `@anthropics/mcp-server-brave-search` | Paid API key, more capable |
| JS-heavy sites | MCP: Firecrawl | Paid, handles JavaScript rendering |
| Web browsing | Browser assist | Claude in Chrome |

**Plain language:**
> "For web research, I can already search and fetch pages with built-in tools.
> If you want enhanced capabilities, there are free extensions that don't
> need API keys. For advanced scraping of JavaScript-heavy sites, there
> are paid options too. Most people don't need those."

---

## Web Search Strategy

When user mentions an unfamiliar tool:

### Search Queries (in order)
1. `"[tool name]" MCP server github`
2. `"[tool name]" CLI automation`
3. `"[tool name]" Claude integration`
4. `"[tool name]" API documentation`

### Evaluate Results For
- **Official vs community** - Official is preferred
- **Last updated** - More recent is better
- **Documentation quality** - Clear setup instructions
- **Security considerations** - Reputable source

### Present Findings

**If good option found:**
```
"I searched for [tool] integrations. Best option: There's an MCP
server that lets me [capability]. It's [official/community-maintained]
and [recently updated/well-documented]. Want the setup guide?"
```

**If no good option:**
```
"I looked for [tool] integrations but didn't find anything reliable.
Options:
• I can help through browser assist (I navigate the web app with you)
• Or you can share content from [tool] and I'll work with that

What would work better for you?"
```

---

## Recommendation Format

Present each recommendation in plain language:

```markdown
### [Service] - [Category]

**What you get:** [Capability in plain terms]

**Effort:** [Easy/Moderate/Involved] - [time estimate]
**How it works:** [One sentence explanation]

Want me to help set this up? [Yes / Later / Skip]
```

### Examples

```markdown
### Gmail - Email Integration

**What you get:** I can read your emails, draft replies,
and include email context in morning briefs.

**Effort:** Moderate - about 5 minutes
**How it works:** I connect through Google's official channel.

Want me to help set this up? [Yes / Later / Skip]
```

```markdown
### GitHub - Code Integration

**What you get:** I can check your repos, issues, and PRs
without you copying and pasting links.

**Effort:** Easy - 1 minute (if gh is installed)
**How it works:** Uses the GitHub CLI that developers usually have.

Want me to check if it's ready? [Yes / Later / Skip]
```

---

## Setup Guidance

### For MCP Servers

When user says "yes" to an MCP integration:

1. **Explain what will happen:**
   ```
   "I'll add this to your .mcp.json file. When you restart
   Claude Code, the connection will be available. You'll need
   to authorize access the first time."
   ```

2. **Provide the configuration:**
   ```
   "Add this to your .mcp.json file under 'mcpServers':

   "[server-name]": {
     "command": "npx",
     "args": ["-y", "@package/server-name"]
   }

   Then restart Claude Code."
   ```

3. **Offer to track:**
   ```
   "Want me to note this in your integrations file so we
   remember what's connected?"
   ```

### For CLI Tools

When recommending CLI tools (gh, rclone, etc.):

1. **Check if installed:**
   ```
   "Let me check if [tool] is already installed..."
   [Run: which gh / which rclone]
   ```

2. **If installed:**
   ```
   "Good news-it's already set up. I can use it right now.
   Want me to try something?"
   ```

3. **If not installed:**
   ```
   "It's not installed yet. You can add it with:
   [installation command]

   Let me know when that's done and I'll help you configure it."
   ```

---

## Guardrails

### During Onboarding
- **Max 3 recommendations** - Don't overwhelm
- **Focus on their mentioned tools** - Don't list everything
- **"Later" is always valid** - Never pressure
- **Lead with benefit, not feature** - "Would it help if I could..."

### General
- **Note declined integrations** - Don't re-suggest
- **Be honest about complexity** - Some setups are involved
- **Respect privacy** - Explain what access means
- **No judgment on choices** - Their preference is valid

---

## Tracking User Preferences

### When User Shows Interest

During onboarding, if user expresses interest in integrations, the structure-generator skill should create `context/integrations.md`.

### Update Integration Status

After any integration discussion:

```markdown
## Active
| Integration | Type | Status | Added |
|-------------|------|--------|-------|
| Gmail | MCP | Connected | Jan 15 |

## Interests
Services you want to connect:
- Google Calendar (mentioned, not set up yet)

## Declined
| Integration | Reason | Date |
|-------------|--------|------|
| Slack | "I prefer to check it manually" | Jan 15 |
```

---

## Example Conversations

### During Onboarding

```
Claudia: "One more thing-you mentioned using Gmail and Notion.
         Want me to see if I can connect to those?"

User: "Yeah, Gmail would be helpful."

Claudia: "Great choice. For Gmail, I'd connect through Google's
         official channel. Setup takes about 5 minutes-you'll
         approve access in your browser.

         Want to set this up now, or finish basic setup first?"

User: "Let's finish setup first."

Claudia: "Perfect. I'll remind you after we're done. Now, for
         your consulting work, here's what I'd suggest..."
```

### Post-Onboarding

```
User: "Can you check my email for that message from Sarah?"

Claudia: "I don't have email access yet. Want me to help set
         that up? For Gmail, it takes about 5 minutes and
         I'd be able to read, search, and draft emails."

User: "Sure, let's do it."

Claudia: "Great! Here's what to add to your .mcp.json file..."
```

### Unknown Tool

```
User: "Can you connect to Linear?"

Claudia: "Let me check what's available for Linear..."
         [searches web]

         "Found a community-maintained MCP server for Linear.
         It lets me read and search issues. Last updated
         recently and has good documentation.

         Want the setup instructions?"
```

---

## Integration with Other Skills

### With Onboarding
- Invoked as Phase 3.5 after archetype detection
- Uses tools mentioned in Phase 2 discovery questions
- Notes user preferences for structure-generator

### With Structure Generator
- Triggers creation of `context/integrations.md` if user interested
- Adds integration section to `context/me.md` if relevant

### With Capability Suggester
- Capability-suggester invokes this skill when:
  - User mentions checking external tools frequently
  - User pastes content from external services
  - User asks "can you see my X" type questions

### With Memory Manager
- Persist integration preferences across sessions
- Remember declined integrations (don't re-suggest)
