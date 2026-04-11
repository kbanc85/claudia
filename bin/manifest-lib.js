// Manifest library: pure functions powering user-skill preservation on upgrade.
//
// Shipped with every Claudia release. bin/index.js imports from here for the
// upgrade flow; the unit tests in test/manifest.test.js cover every exported
// function.
//
// See the execution brief in the commit that introduced this file for the
// full design (three-way merge via shipped manifest + batch prompt UX).

import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, relative, sep, posix } from 'node:path';

// ---------------------------------------------------------------------------
// Scope rules — what the manifest tracks.
// Only files matching TRACK_PREFIXES (or the exact file CLAUDE.md) are
// included. Anything matching EXCLUDE_PATTERNS is filtered out.
// ---------------------------------------------------------------------------

const TRACK_PREFIXES = [
  '.claude/skills/',
  '.claude/rules/',
];

const TRACKED_ROOT_FILES = new Set([
  'CLAUDE.md',
]);

const EXCLUDE_SEGMENTS = [
  '.claude/hooks/',
  '.claude/agents/',
  '.claude/commands/',
  'workspaces/',
  'node_modules/',
];

const EXCLUDE_BASENAMES = new Set([
  'settings.local.json',
  'manifest.json',
  '.DS_Store',
]);

function isTrackedPath(relPosixPath) {
  if (EXCLUDE_BASENAMES.has(relPosixPath.split('/').pop())) return false;
  for (const seg of EXCLUDE_SEGMENTS) {
    if (relPosixPath.startsWith(seg)) return false;
  }
  if (TRACKED_ROOT_FILES.has(relPosixPath)) return true;
  for (const prefix of TRACK_PREFIXES) {
    if (relPosixPath.startsWith(prefix)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// hashFile — SHA-256 hex over raw bytes.
// ---------------------------------------------------------------------------

export function hashFile(absPath) {
  const bytes = readFileSync(absPath);
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// walkFiles — recursive directory walk yielding posix-style relative paths.
// ---------------------------------------------------------------------------

function walkFiles(rootDir) {
  const out = [];
  function recurse(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  recurse(rootDir);
  return out;
}

function toPosixRel(rootDir, absPath) {
  return relative(rootDir, absPath).split(sep).join(posix.sep);
}

// ---------------------------------------------------------------------------
// generateManifest — hashes every tracked file under rootDir.
// ---------------------------------------------------------------------------

export function generateManifest(rootDir, { version = 'unknown' } = {}) {
  const files = {};
  for (const abs of walkFiles(rootDir)) {
    const relPosix = toPosixRel(rootDir, abs);
    if (!isTrackedPath(relPosix)) continue;
    files[relPosix] = hashFile(abs);
  }
  return {
    version,
    generated: new Date().toISOString(),
    algorithm: 'sha256',
    files,
  };
}

// ---------------------------------------------------------------------------
// detectConflicts — three-way merge between old shipped, new shipped, and
// the user's current files.
// ---------------------------------------------------------------------------

function safeManifestFiles(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  if (!manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    return null;
  }
  return manifest.files;
}

export function detectConflicts({ userDir, templateDir, oldManifest, newManifest }) {
  const conflicts = [];
  const userModifiedOnly = [];
  const templateChangedOnly = [];
  const unchanged = [];

  const newFiles = safeManifestFiles(newManifest) || {};
  const oldFiles = safeManifestFiles(oldManifest); // may be null

  for (const relPath of Object.keys(newFiles)) {
    const newHash = newFiles[relPath];
    const userAbs = join(userDir, ...relPath.split('/'));

    // File doesn't exist in user dir → not a conflict, the normal copy will create it
    if (!existsSync(userAbs)) continue;

    let userHash;
    try {
      userHash = hashFile(userAbs);
    } catch {
      // Unreadable file → skip, let the normal copy handle it
      continue;
    }

    if (oldFiles && typeof oldFiles[relPath] === 'string') {
      const oldHash = oldFiles[relPath];
      const userDiffers = userHash !== oldHash;
      const templateDiffers = newHash !== oldHash;

      if (!userDiffers && !templateDiffers) {
        unchanged.push(relPath);
      } else if (!userDiffers && templateDiffers) {
        templateChangedOnly.push(relPath);
      } else if (userDiffers && !templateDiffers) {
        userModifiedOnly.push(relPath);
      } else {
        // both changed
        if (userHash === newHash) {
          // User happened to edit to the new value — no conflict
          unchanged.push(relPath);
        } else {
          conflicts.push(relPath);
        }
      }
    } else {
      // No prior manifest entry — fall back to direct compare against new template
      if (userHash === newHash) {
        unchanged.push(relPath);
      } else {
        conflicts.push(relPath);
      }
    }
  }

  return { conflicts, userModifiedOnly, templateChangedOnly, unchanged };
}

// ---------------------------------------------------------------------------
// resolveBakPath — returns a .bak path that doesn't collide.
// ---------------------------------------------------------------------------

export function resolveBakPath(absPath) {
  const base = absPath + '.bak';
  if (!existsSync(base)) return base;
  let n = 1;
  while (existsSync(base + '.' + n)) n++;
  return base + '.' + n;
}

// ---------------------------------------------------------------------------
// applyResolution — turns a user choice into explicit skip/overwrite lists.
// Pure: no filesystem side effects. Wraps the decision for unit testing.
// ---------------------------------------------------------------------------

export function applyResolution(conflicts, { choice, perFile } = {}) {
  if (choice === 'cancel') {
    return { skip: [], overwrite: [], cancelled: true };
  }
  if (choice === 'keep-all') {
    return { skip: [...conflicts], overwrite: [], cancelled: false };
  }
  if (choice === 'overwrite-all') {
    return { skip: [], overwrite: [...conflicts], cancelled: false };
  }
  if (choice === 'per-file') {
    const skip = [];
    const overwrite = [];
    for (const f of conflicts) {
      const answer = (perFile && perFile[f]) || 'keep';
      if (answer === 'overwrite') overwrite.push(f);
      else skip.push(f);
    }
    return { skip, overwrite, cancelled: false };
  }
  // Unknown choice → fail safe: keep user versions
  return { skip: [...conflicts], overwrite: [], cancelled: false };
}

// ---------------------------------------------------------------------------
// loadManifest — safe JSON load that returns null on any failure.
// Used by bin/index.js to read the user's existing manifest.
// ---------------------------------------------------------------------------

export function loadManifest(absPath) {
  try {
    if (!existsSync(absPath)) return null;
    const raw = readFileSync(absPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!safeManifestFiles(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
