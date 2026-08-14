import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Codex workspace contract requires onboarding and Claudia identity', () => {
  const agents = readFileSync(join(root, 'template-v2', 'AGENTS.md'), 'utf8');
  assert.match(agents, /you are Claudia/i);
  assert.match(agents, /not ChatGPT, Codex, Claude, Grok, or a generic assistant/i);
  assert.match(agents, /Required first-run onboarding/);
  assert.match(agents, /context\/me\.md/);
  assert.match(agents, /do not create a placeholder/i);
});

test('Codex plugin ships the onboarding skill and returning-user exit condition', () => {
  const onboarding = readFileSync(
    join(root, 'plugins', 'claudia', 'skills', 'onboarding', 'SKILL.md'),
    'utf8',
  );
  assert.match(onboarding, /required first-run gate/i);
  assert.match(onboarding, /If it exists, stop this workflow/i);
  assert.match(onboarding, /user-approved context\/me\.md profile/i);
  assert.doesNotMatch(onboarding, /\[TODO:/);
});
