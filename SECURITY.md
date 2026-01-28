# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Claudia, please report it privately rather than opening a public issue.

**Email**: kamilbanc [at] gmail.com

**Subject line**: `[SECURITY] Brief description`

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

### What to Expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days
- **Credit** in the fix announcement (unless you prefer anonymity)

## Scope

### In Scope

- The `npx get-claudia` installer (`bin/index.js`)
- Memory daemon (`memory-daemon/`)
- Template files that execute code
- MCP server configuration

### Out of Scope

- Claude Code itself (report to Anthropic)
- Ollama (report to Ollama)
- User-modified template files
- Third-party dependencies

## Security Model

Claudia runs locally on your machine. Key security considerations:

1. **Memory daemon** listens only on localhost (127.0.0.1:3848)
2. **No external network calls** except Ollama embeddings (local)
3. **All data stays local** in `~/.claudia/` and your workspace
4. **No telemetry** or analytics

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.3.x   | Yes                |
| 1.2.x   | Security fixes only |
| < 1.2   | No                 |

## Best Practices

- Keep Claude Code updated
- Review `.mcp.json` before running
- Don't commit sensitive data to context files
- Run `~/.claudia/diagnose.sh` to verify service configuration
