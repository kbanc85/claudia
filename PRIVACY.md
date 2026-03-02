# Privacy Policy

**Effective Date:** March 2, 2026
**Last Updated:** March 2, 2026

Claudia is an open-source, locally-run AI assistant. This policy explains how the application handles your data.

## The Short Version

Claudia runs entirely on your computer. Your data never leaves your machine. There are no servers, no analytics, no tracking. You can verify this yourself by reading the source code.

## Data Storage

All data created by Claudia is stored locally on your computer:

| Data | Location | Purpose |
|------|----------|---------|
| Memory database | `~/.claudia/memory/` | Stores memories, entities, and relationships |
| OAuth tokens | `~/.claudia/tokens/` | Google API access tokens for Gmail/Calendar |
| Configuration | `~/.claudia/config.json` | Your preferences and settings |
| Vault (optional) | `~/.claudia/vault/` | Obsidian-compatible markdown export |

No data is transmitted to the developer, to Claudia's servers (there are none), or to any third party.

## Google API Access

When you connect Gmail or Google Calendar via `claudia gmail login` or `claudia calendar login`:

- **What happens:** Your browser opens to Google's sign-in page. You grant access. OAuth tokens are saved to `~/.claudia/tokens/` on your local filesystem.
- **What Claudia accesses:** Only the Gmail and Calendar data you explicitly request through CLI commands (e.g., `claudia gmail search "query"`).
- **What Claudia does NOT do:**
  - Does not store your Google data on any remote server
  - Does not share your data with anyone
  - Does not send analytics or telemetry
  - Does not access data beyond what you request in each command
  - Does not run background syncs or polling

### Google API Services User Data Policy

Claudia's use of Google APIs complies with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements:

1. **Limited use:** Google data is used only to provide the features you invoke (search, read, list events).
2. **No transfer:** Google data is not transferred to third parties.
3. **No advertising:** Google data is never used for advertising purposes.
4. **No unauthorized access:** Google data is stored only on your local machine in files accessible only to your user account.

### Revoking Access

You can revoke Claudia's access to your Google account at any time:

- Run `claudia gmail logout` or `claudia calendar logout` to remove local tokens
- Visit [Google Account Permissions](https://myaccount.google.com/permissions) to revoke the app's access

## Ollama / AI Model Usage

Claudia uses Ollama (running locally on your machine) for text embeddings. All AI processing happens on your computer. No text is sent to external AI services by Claudia itself.

Note: If you use Claudia within Claude Code, your conversations with Claude are subject to [Anthropic's privacy policy](https://www.anthropic.com/privacy), not this one. Claudia's memory system is separate and local.

## Data Collection

Claudia collects **zero** data:

- No analytics
- No telemetry
- No crash reports
- No usage statistics
- No cookies
- No tracking of any kind

## Children's Privacy

Claudia does not knowingly collect data from children under 13. Since Claudia collects no data from anyone, this is inherently satisfied.

## Open Source

Claudia is open source under the Apache 2.0 license. You can inspect every line of code to verify these claims:

- Repository: [github.com/kbanc85/claudia](https://github.com/kbanc85/claudia)
- OAuth implementation: `cli/core/google-oauth.js`
- Token storage: `~/.claudia/tokens/`

## Disclaimer

Claudia is provided "as-is" without warranty of any kind. The developer assumes no liability for data loss, security incidents, or any other damages arising from the use of this software. See the [Apache 2.0 License](./LICENSE) for full terms.

## Changes to This Policy

Updates to this policy will be posted in the GitHub repository. Since Claudia has no server and collects no data, there is nothing to notify you about retroactively.

## Contact

For questions about this privacy policy, open an issue on [GitHub](https://github.com/kbanc85/claudia/issues).
