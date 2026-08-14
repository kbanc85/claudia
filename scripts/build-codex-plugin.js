#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceSkills = join(root, 'template-v2', '.claude', 'skills');
const pluginRoot = join(root, 'plugins', 'claudia');
const outputSkills = join(pluginRoot, 'skills');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function adaptForCodex(text) {
  const adapted = text
    .replaceAll('Claude Code', 'Codex')
    .replaceAll('direct Claude extraction', 'direct model extraction')
    .replaceAll('new `claude` session', 'new Codex session')
    .replaceAll(
      '`.claude/agents/loop-checker.md` for the Checker agent definition',
      'an isolated evaluator subagent using the workspace loop-checker instructions',
    )
    .replaceAll('Task tool', 'sub-agent tool')
    .replaceAll('Task calls', 'sub-agent calls')
    .replaceAll('template-v2/.claude/skills/', 'skills/')
    .replaceAll('.claude/skills/', 'skills/');

  // Codex validates SKILL.md frontmatter as strict YAML. The source skills are
  // accepted by Claude's looser parser, but descriptions containing `See also:`
  // need quoting to remain valid YAML everywhere.
  return adapted.replace(
    /^description:\s*(.*)$/m,
    (_line, description) => `description: ${JSON.stringify(description)}`,
  );
}

function adaptMarkdownTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) adaptMarkdownTree(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) {
      writeFileSync(path, adaptForCodex(readFileSync(path, 'utf8')));
    }
  }
}

rmSync(outputSkills, { recursive: true, force: true });
mkdirSync(outputSkills, { recursive: true });

for (const entry of readdirSync(sourceSkills, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const sourceDir = join(sourceSkills, entry.name);
  const sourceFile = join(sourceDir, 'SKILL.md');
  if (!existsSync(sourceFile)) continue;

  const targetDir = join(outputSkills, entry.name);
  cpSync(sourceDir, targetDir, { recursive: true });
  adaptMarkdownTree(targetDir);
}

const codexSkills = join(root, 'codex', 'skills');
for (const entry of readdirSync(codexSkills, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  cpSync(join(codexSkills, entry.name), join(outputSkills, entry.name), {
    recursive: true,
    force: true,
  });
}

const hooksDir = join(pluginRoot, 'hooks');
rmSync(hooksDir, { recursive: true, force: true });
mkdirSync(hooksDir, { recursive: true });
cpSync(join(root, 'host-adapters', 'codex', 'hooks.json'), join(hooksDir, 'hooks.json'));
cpSync(join(root, 'host-adapters', 'codex', 'session-start.mjs'), join(hooksDir, 'session-start.mjs'));
cpSync(join(root, 'host-adapters', 'codex', 'session-end.mjs'), join(hooksDir, 'session-end.mjs'));

const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = packageJson.version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Built Claudia Codex plugin v${packageJson.version} with ${readdirSync(outputSkills).length} skills.`);
