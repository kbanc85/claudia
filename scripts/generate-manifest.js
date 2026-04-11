#!/usr/bin/env node
// Regenerates template-v2/.claude/manifest.json from the current template tree.
// Run via `npm run generate-manifest` or automatically on `npm publish` via
// prepublishOnly. Committed output is what ships to every new install.

import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateManifest } from '../bin/manifest-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const templateDir = join(repoRoot, 'template-v2');
const manifestPath = join(templateDir, '.claude', 'manifest.json');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

const version = readPackageVersion();
const manifest = generateManifest(templateDir, { version });

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const fileCount = Object.keys(manifest.files).length;
console.log(`✓ Wrote manifest with ${fileCount} tracked files → ${manifestPath}`);
