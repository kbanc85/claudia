/**
 * Changelog extraction and whats-new.md generation.
 * Used to surface upgrade notes to Claudia at first session post-install.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { colors } from './lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function extractChangelog(version) {
  try {
    const changelogPath = join(__dirname, '..', 'CHANGELOG.md');
    const changelog = readFileSync(changelogPath, 'utf8');
    const versionHeader = `## ${version}`;
    const startIdx = changelog.indexOf(versionHeader);
    if (startIdx === -1) return null;

    const afterHeader = startIdx + versionHeader.length;
    const nextHeader = changelog.indexOf('\n## ', afterHeader);
    const section = nextHeader === -1
      ? changelog.slice(afterHeader)
      : changelog.slice(afterHeader, nextHeader);

    return section.trim();
  } catch {
    return null;
  }
}

export function writeWhatsNewFile(targetPath, version) {
  try {
    const contextDir = join(targetPath, 'context');
    mkdirSync(contextDir, { recursive: true });

    const date = new Date().toISOString().slice(0, 10);
    const changelogSection = extractChangelog(version) || 'No changelog available for this version.';

    let skillSections = '';
    try {
      const skillIndexPath = join(__dirname, '..', 'template-v2', '.claude', 'skills', 'skill-index.json');
      const skillIndex = JSON.parse(readFileSync(skillIndexPath, 'utf8'));
      const skills = skillIndex.skills || [];

      const proactive = skills.filter(s => s.invocation === 'proactive');
      const contextual = skills.filter(s => s.invocation === 'contextual');
      const explicit = skills.filter(s => s.invocation === 'explicit');

      skillSections = `## Your Complete Skill Set

### Proactive (auto-activate)
${proactive.map(s => `- **${s.name}** - ${s.description}`).join('\n')}

### Contextual (natural language or /command)
${contextual.map(s => `- **/${s.name}** - ${s.description}`).join('\n')}

### Explicit (/command only)
${explicit.map(s => `- **/${s.name}** - ${s.description}`).join('\n')}

## Memory System
Memory operations use MCP tools from the claudia-memory daemon (memory_recall, memory_remember, memory_about, etc.).
The daemon provides ~33 tools for semantic search, pattern detection, and relationship tracking.
See the memory-manager skill for the full tool reference.`;
    } catch {
      // skill-index.json not found, skip skills section
    }

    const googleSection = `## Google Workspace Integration

Claudia connects to your full Google Workspace: Gmail, Calendar, Drive, Docs, Sheets, Tasks, and more through one server.

**Quick setup:** Run \`npx get-claudia google\` to configure it interactively. It will generate a one-click URL to enable all required APIs at once.

Or see the Google Integration Setup section in CLAUDE.md for manual configuration. If you enable new APIs later, remember to re-authenticate (delete ~/.workspace-mcp/token.json and restart Claude Code).`;

    const content = `# Updated to v${version} (${date})

## What's New

${changelogSection}

${googleSection}

${skillSections}

---
_Surface this update in your first greeting, then delete this file._
`;

    writeFileSync(join(contextDir, 'whats-new.md'), content);
  } catch (err) {
    // Non-fatal
    process.stderr.write(`${colors.dim}  Could not write whats-new.md: ${err.message}${colors.reset}\n`);
  }
}
