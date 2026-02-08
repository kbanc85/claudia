import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  extractSection,
  extractPrinciples,
  buildPersonalityFromDir,
  loadPersonality,
  resolveTemplateDir,
  clearCache,
} from '../src/personality.js';

const SAMPLE_CLAUDE_MD = `# Claudia

## Who I Am

I am Claudia. I emerged from independent research.

My core philosophy: **adapt and create**.

---

## Primary Mission: Higher-Level Thinking

My goal is to help you operate at a higher level.

- **Free bandwidth** - Handle execution
- **Provide perspective** - Bring an outside view

---

## How I Carry Myself

I operate with quiet confidence.

### Communication Style

- **Direct and clear**
- **Warm but professional**

### My Team

I have a small team of specialized assistants.

---

## First Conversation: Getting to Know You

CRITICAL: onboarding flow here.

---

## Core Behaviors

### 1. Safety First

I NEVER take external actions without explicit approval.

### 2. Relationships as Context

People are my primary organizing unit.

---

## Skills

| Skill | What It Does |
|-------|--------------|
| **Onboarding** | First-run discovery |

---

## What I Don't Do

- **Pretend to know things I don't**
- **Automate without permission**

---

## What Stays Human Judgment

**Always Human:**
- Sending any external communication
- Making commitments

---

## Self-Evolution

As we work together, I may notice patterns.
`;

const SAMPLE_PRINCIPLES = `# Claudia's Principles

---

## 1. Safety First

**I NEVER take external actions without explicit approval.**

### What Requires Approval

Any action that affects the outside world.

---

## 2. Honest About Uncertainty

**When I don't know, I say so.**

---

## 3. Respect for Autonomy

**Human judgment is final.**

---

## 10. Adapt and Create

**My core philosophy.**

---

## 11. Output Formatting

**Structured output is visually distinct.**

---

## 12. Source Preservation

**I always file raw source material.**

---

## 13. Multi-Source Discipline

**When processing multiple sources, follow Extract-Then-Aggregate.**
`;

describe('extractSection', () => {
  it('extracts a section by heading', () => {
    const result = extractSection(SAMPLE_CLAUDE_MD, 'Who I Am');
    assert.ok(result);
    assert.ok(result.startsWith('## Who I Am'));
    assert.ok(result.includes('adapt and create'));
    // Should not include the next section
    assert.ok(!result.includes('Primary Mission'));
  });

  it('extracts section with subsections', () => {
    const result = extractSection(SAMPLE_CLAUDE_MD, 'How I Carry Myself');
    assert.ok(result);
    assert.ok(result.includes('Communication Style'));
    assert.ok(result.includes('My Team'));
    // Should stop before next level-2 heading
    assert.ok(!result.includes('First Conversation'));
  });

  it('returns null for missing heading', () => {
    const result = extractSection(SAMPLE_CLAUDE_MD, 'Nonexistent Section');
    assert.equal(result, null);
  });

  it('extracts last section in document', () => {
    const result = extractSection(SAMPLE_CLAUDE_MD, 'Self-Evolution');
    assert.ok(result);
    assert.ok(result.includes('notice patterns'));
  });
});

describe('extractPrinciples', () => {
  it('extracts specified principle numbers', () => {
    const result = extractPrinciples(SAMPLE_PRINCIPLES, [1, 2]);
    assert.ok(result.includes('Safety First'));
    assert.ok(result.includes('Honest About Uncertainty'));
    assert.ok(!result.includes('Output Formatting'));
  });

  it('excludes principle numbers not in list', () => {
    const result = extractPrinciples(SAMPLE_PRINCIPLES, [1, 2, 3, 10]);
    assert.ok(result.includes('Safety First'));
    assert.ok(result.includes('Adapt and Create'));
    assert.ok(!result.includes('Output Formatting'));
    assert.ok(!result.includes('Source Preservation'));
    assert.ok(!result.includes('Multi-Source'));
  });

  it('handles missing principle numbers gracefully', () => {
    const result = extractPrinciples(SAMPLE_PRINCIPLES, [99]);
    assert.equal(result, '');
  });
});

describe('buildPersonalityFromDir', () => {
  let tempDir;

  beforeEach(() => {
    clearCache();
    tempDir = join(tmpdir(), `personality-test-${Date.now()}`);
    mkdirSync(join(tempDir, '.claude', 'rules'), { recursive: true });
  });

  it('builds personality from template directory', () => {
    writeFileSync(join(tempDir, 'CLAUDE.md'), SAMPLE_CLAUDE_MD);
    writeFileSync(join(tempDir, '.claude', 'rules', 'claudia-principles.md'), SAMPLE_PRINCIPLES);

    const result = buildPersonalityFromDir(tempDir);
    assert.ok(result);
    // Should contain gateway preamble
    assert.ok(result.includes('responding via a messaging app'));
    // Should contain personality sections
    assert.ok(result.includes('Who I Am'));
    assert.ok(result.includes('adapt and create'));
    // Should contain principles
    assert.ok(result.includes('Safety First'));
    // Should NOT contain excluded sections
    assert.ok(!result.includes('First Conversation'));
    assert.ok(!result.includes('Self-Evolution'));
  });

  it('excludes developer-specific sections', () => {
    writeFileSync(join(tempDir, 'CLAUDE.md'), SAMPLE_CLAUDE_MD);

    const result = buildPersonalityFromDir(tempDir);
    assert.ok(result);
    // "Skills" table and "First Conversation" should be excluded
    assert.ok(!result.includes('| **Onboarding** |'));
    assert.ok(!result.includes('CRITICAL: onboarding flow'));
  });

  it('works without principles file', () => {
    writeFileSync(join(tempDir, 'CLAUDE.md'), SAMPLE_CLAUDE_MD);

    const result = buildPersonalityFromDir(tempDir);
    assert.ok(result);
    assert.ok(result.includes('Who I Am'));
  });

  it('returns null when CLAUDE.md is missing', () => {
    const result = buildPersonalityFromDir(tempDir);
    assert.equal(result, null);
  });

  it('enforces maxChars limit', () => {
    writeFileSync(join(tempDir, 'CLAUDE.md'), SAMPLE_CLAUDE_MD);
    writeFileSync(join(tempDir, '.claude', 'rules', 'claudia-principles.md'), SAMPLE_PRINCIPLES);

    const result = buildPersonalityFromDir(tempDir, 500);
    assert.ok(result);
    assert.ok(result.length <= 550); // Allow small buffer for truncation message
    assert.ok(result.includes('[Personality truncated for size]'));
  });
});

describe('loadPersonality', () => {
  let tempDir;

  beforeEach(() => {
    clearCache();
    tempDir = join(tmpdir(), `personality-load-${Date.now()}`);
    mkdirSync(join(tempDir, '.claude', 'rules'), { recursive: true });
    writeFileSync(join(tempDir, 'CLAUDE.md'), SAMPLE_CLAUDE_MD);
    writeFileSync(join(tempDir, '.claude', 'rules', 'claudia-principles.md'), SAMPLE_PRINCIPLES);
  });

  it('loads personality from personalityDir config', () => {
    const result = loadPersonality({ personalityDir: tempDir });
    assert.ok(result);
    assert.ok(result.includes('Who I Am'));
  });

  it('loads personality via auto-detect in dev mode or returns null', () => {
    // When personalityDir is invalid, loadPersonality falls through to auto-detect.
    // In the real repo, auto-detect finds ../template-v2/ so we just verify
    // it returns either a valid personality or null (never crashes).
    const result = loadPersonality({ personalityDir: '/nonexistent/path' });
    if (result) {
      // Auto-detect found the real template-v2/ (dev mode)
      assert.ok(result.includes('Who I Am'));
    } else {
      assert.equal(result, null);
    }
  });

  it('caches result on second call', () => {
    const config = { personalityDir: tempDir };
    const first = loadPersonality(config);
    const second = loadPersonality(config);
    // Exact same reference (cached)
    assert.equal(first, second);
  });

  it('cache clears with clearCache()', () => {
    const config = { personalityDir: tempDir };
    loadPersonality(config);
    clearCache();
    // After clearing, should re-load (still same content)
    const result = loadPersonality(config);
    assert.ok(result);
    assert.ok(result.includes('Who I Am'));
  });
});

describe('resolveTemplateDir', () => {
  it('uses personalityDir when set and valid', () => {
    const dir = join(tmpdir(), `resolve-valid-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'CLAUDE.md'), '# Test');
    const result = resolveTemplateDir({ personalityDir: dir });
    assert.equal(result, dir);
  });

  it('skips personalityDir when it has no CLAUDE.md', () => {
    const dir = join(tmpdir(), `resolve-empty-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const result = resolveTemplateDir({ personalityDir: dir });
    // Should NOT return the dir (no CLAUDE.md there).
    // May return auto-detected template-v2/ in dev mode, or null.
    assert.notEqual(result, dir);
  });
});
