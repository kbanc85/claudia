/**
 * Conflict-resolution helpers for the upgrade cpSync step.
 * Detects user-modified shipped files, asks the user what to do, and
 * returns the set of paths to skip during the copy.
 */

import { existsSync, readFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { colors, isTTY, getVersion } from './lib.js';
import { promptKey } from './prompt.js';
import {
  loadManifest,
  generateManifest,
  detectConflicts,
  resolveBakPath,
  applyResolution,
} from './manifest-lib.js';

// Detect + resolve conflicts between shipped framework files and the user's
// locally modified versions. Returns the set of relative paths the caller
// must skip during cpSync. Saves .bak siblings for any file the user chose
// to overwrite. May exit(0) if the user cancels.
export async function handleSkillConflicts(targetPath, templatePath) {
  const userManifestPath = join(targetPath, '.claude', 'manifest.json');
  const newManifestPath = join(templatePath, '.claude', 'manifest.json');

  const oldManifest = loadManifest(userManifestPath);
  let newManifest = loadManifest(newManifestPath);

  // If the shipped manifest is missing (older package or dev build), fall
  // back to generating one on the fly from the template tree. This keeps
  // the feature working even when scripts/generate-manifest.js wasn't run.
  if (!newManifest) {
    try {
      newManifest = generateManifest(templatePath, { version: getVersion() });
    } catch {
      return new Set(); // can't detect conflicts; preserve old behavior
    }
  }

  const result = detectConflicts({
    userDir: targetPath,
    templateDir: templatePath,
    oldManifest,
    newManifest,
  });

  if (result.conflicts.length === 0) {
    return new Set(); // nothing to prompt about
  }

  // Non-TTY or --yes → default to keeping user versions (safe in CI).
  const isNonInteractive = !isTTY || process.argv.includes('--yes') || process.argv.includes('-y');

  console.log('');
  console.log(` ${colors.yellow}⚠${colors.reset}  ${result.conflicts.length} file(s) have local modifications that would be overwritten:`);
  console.log('');
  for (const f of result.conflicts) {
    console.log(`    ${colors.dim}${f}${colors.reset}`);
  }
  console.log('');

  if (isNonInteractive) {
    console.log(` ${colors.cyan}i${colors.reset}  Non-interactive mode — keeping your versions. Updates for these files skipped.`);
    console.log('');
    return new Set(result.conflicts);
  }

  console.log(' How do you want to handle these?');
  console.log(`   ${colors.bold}[k]${colors.reset} Keep all my versions (skip updates for these files)`);
  console.log(`   ${colors.bold}[o]${colors.reset} Overwrite all ${colors.dim}(saves your versions as .bak)${colors.reset}`);
  console.log(`   ${colors.bold}[r]${colors.reset} Review each one`);
  console.log(`   ${colors.bold}[c]${colors.reset} Cancel upgrade`);
  console.log('');

  const topChoice = await promptKey(' Choice: ', ['k', 'o', 'r', 'c'], 'k');

  let resolution;
  if (topChoice === 'k') {
    resolution = applyResolution(result.conflicts, { choice: 'keep-all' });
  } else if (topChoice === 'o') {
    resolution = applyResolution(result.conflicts, { choice: 'overwrite-all' });
  } else if (topChoice === 'c') {
    resolution = applyResolution(result.conflicts, { choice: 'cancel' });
  } else {
    // review each
    const perFile = {};
    let skipRest = false;
    for (const f of result.conflicts) {
      if (skipRest) {
        perFile[f] = 'keep';
        continue;
      }
      console.log('');
      console.log(`   ${colors.cyan}•${colors.reset} ${f}`);
      const k = await promptKey(
        `     ${colors.bold}[k]${colors.reset}eep / ${colors.bold}[o]${colors.reset}verwrite / ${colors.bold}[d]${colors.reset}iff / ${colors.bold}[s]${colors.reset}kip rest: `,
        ['k', 'o', 'd', 's'],
        'k',
      );
      if (k === 'd') {
        showDiff(join(targetPath, f), join(templatePath, f));
        // Re-prompt after showing the diff
        const k2 = await promptKey(
          `     ${colors.bold}[k]${colors.reset}eep / ${colors.bold}[o]${colors.reset}verwrite: `,
          ['k', 'o'],
          'k',
        );
        perFile[f] = k2 === 'o' ? 'overwrite' : 'keep';
      } else if (k === 's') {
        perFile[f] = 'keep';
        skipRest = true;
      } else {
        perFile[f] = k === 'o' ? 'overwrite' : 'keep';
      }
    }
    resolution = applyResolution(result.conflicts, { choice: 'per-file', perFile });
  }

  if (resolution.cancelled) {
    console.log('');
    console.log(` ${colors.dim}Upgrade cancelled. No files changed.${colors.reset}`);
    process.exit(0);
  }

  // Back up user versions for any file they chose to overwrite
  for (const relPath of resolution.overwrite) {
    const userAbs = join(targetPath, relPath);
    if (existsSync(userAbs)) {
      try {
        const bakAbs = resolveBakPath(userAbs);
        copyFileSync(userAbs, bakAbs);
        console.log(` ${colors.cyan}↺${colors.reset}  Backed up ${colors.dim}${relPath}${colors.reset} → ${colors.dim}${bakAbs.replace(targetPath + '/', '')}${colors.reset}`);
      } catch (err) {
        console.log(` ${colors.red}!${colors.reset}  Failed to back up ${relPath}: ${err.message}`);
      }
    }
  }

  if (resolution.skip.length > 0) {
    console.log('');
    console.log(` ${colors.green}✓${colors.reset} Kept your versions of ${resolution.skip.length} file(s).`);
  }

  return new Set(resolution.skip);
}

// Best-effort diff display. Uses `git diff --no-index` if git is on PATH;
// otherwise prints a plain head-of-each-file comparison.
export function showDiff(userAbs, templateAbs) {
  try {
    const out = execFileSync('git', ['diff', '--no-index', '--no-color', userAbs, templateAbs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    console.log(out);
  } catch (err) {
    // git diff --no-index returns exit 1 when files differ — that's normal
    if (err.stdout) {
      console.log(err.stdout);
      return;
    }
    // No git available — fall back to naive display
    try {
      const userLines = readFileSync(userAbs, 'utf8').split('\n').slice(0, 40);
      const tmplLines = readFileSync(templateAbs, 'utf8').split('\n').slice(0, 40);
      console.log(`     ${colors.dim}--- your version (first 40 lines) ---${colors.reset}`);
      userLines.forEach((l) => console.log(`     ${l}`));
      console.log(`     ${colors.dim}--- shipped version (first 40 lines) ---${colors.reset}`);
      tmplLines.forEach((l) => console.log(`     ${l}`));
    } catch {
      console.log(`     ${colors.dim}(diff unavailable)${colors.reset}`);
    }
  }
}
