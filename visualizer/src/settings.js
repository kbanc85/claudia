/**
 * Claudia Brain -- Unified settings persistence
 *
 * Single localStorage key for all settings. Migrates old per-slider
 * keys on first load. Supports named presets, export/import.
 * Null visual values mean "use theme defaults".
 */

const STORAGE_KEY = 'claudia-brain-settings';
const VERSION = 1;

const DEFAULTS = {
  version: VERSION,
  theme: 'deep-space',
  cameraMode: 'slowOrbit',
  performance: {
    quality: 'high',
    antialias: true,
    nodeLabels: true,
    memoriesVisible: true,
    showHistorical: true,
    maxParticles: 2,
  },
  simulation: {
    chargeStrength: -180,
    linkDistance: 80,
    linkStrength: 0.3,
    velocityDecay: 0.4,
    alphaDecay: 0.008,
  },
  visuals: {
    bloomStrength: null,
    bloomRadius: null,
    bloomThreshold: null,
    linkCurvature: 0.25,
    particleSpeed: 0.004,
    particleWidth: 1.5,
  },
  presets: {},
};

let settings = null;

// ── Load / Save ──────────────────────────────────────────

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      settings = JSON.parse(raw);
      if (settings.version !== VERSION) {
        settings = deepMerge(structuredClone(DEFAULTS), settings);
        settings.version = VERSION;
        saveSettings();
      }
    } else {
      settings = migrateOldKeys();
      saveSettings();
    }
  } catch {
    settings = structuredClone(DEFAULTS);
    saveSettings();
  }
  return settings;
}

export function saveSettings() {
  if (!settings) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}
}

export function getSettings() {
  if (!settings) loadSettings();
  return settings;
}

// ── Dot-path access ──────────────────────────────────────

export function getSetting(dotPath) {
  if (!settings) loadSettings();
  const parts = dotPath.split('.');
  let obj = settings;
  for (const p of parts) {
    if (obj == null) return undefined;
    obj = obj[p];
  }
  return obj;
}

export function setSetting(dotPath, value) {
  if (!settings) loadSettings();
  const parts = dotPath.split('.');
  let obj = settings;
  for (let i = 0; i < parts.length - 1; i++) {
    if (obj[parts[i]] == null) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
  saveSettings();
}

// ── Export / Import ──────────────────────────────────────

export function exportSettings() {
  if (!settings) loadSettings();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claudia-brain-settings-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSettings(json) {
  try {
    const imported = typeof json === 'string' ? JSON.parse(json) : json;
    settings = deepMerge(structuredClone(DEFAULTS), imported);
    settings.version = VERSION;
    saveSettings();
    return true;
  } catch {
    return false;
  }
}

// ── Presets ──────────────────────────────────────────────

export function savePreset(name) {
  if (!settings) loadSettings();
  const snapshot = structuredClone(settings);
  delete snapshot.presets;
  if (!settings.presets) settings.presets = {};
  settings.presets[name] = snapshot;
  saveSettings();
}

export function loadPreset(name) {
  if (!settings) loadSettings();
  const preset = settings.presets?.[name];
  if (!preset) return false;
  const presets = settings.presets;
  Object.assign(settings, deepMerge(structuredClone(DEFAULTS), preset));
  settings.presets = presets;
  settings.version = VERSION;
  saveSettings();
  return true;
}

export function deletePreset(name) {
  if (!settings) loadSettings();
  if (settings.presets?.[name]) {
    delete settings.presets[name];
    saveSettings();
  }
}

export function listPresets() {
  if (!settings) loadSettings();
  return Object.keys(settings.presets || {});
}

// ── Migration from old localStorage keys ─────────────────

const OLD_KEY_MAP = {
  'claudia-brain-sim-chargeStrength': 'simulation.chargeStrength',
  'claudia-brain-sim-linkDistance': 'simulation.linkDistance',
  'claudia-brain-sim-linkStrength': 'simulation.linkStrength',
  'claudia-brain-sim-velocityDecay': 'simulation.velocityDecay',
  'claudia-brain-sim-alphaDecay': 'simulation.alphaDecay',
  'claudia-brain-sim-bloomStrength': 'visuals.bloomStrength',
  'claudia-brain-sim-bloomRadius': 'visuals.bloomRadius',
  'claudia-brain-sim-bloomThreshold': 'visuals.bloomThreshold',
  'claudia-brain-sim-linkCurvature': 'visuals.linkCurvature',
  'claudia-brain-sim-particleSpeed': 'visuals.particleSpeed',
  'claudia-brain-sim-particleWidth': 'visuals.particleWidth',
};

function migrateOldKeys() {
  const migrated = structuredClone(DEFAULTS);

  try {
    const quality = localStorage.getItem('claudia-brain-quality');
    if (quality) {
      migrated.performance.quality = quality;
      localStorage.removeItem('claudia-brain-quality');
    }

    for (const [oldKey, dotPath] of Object.entries(OLD_KEY_MAP)) {
      const val = localStorage.getItem(oldKey);
      if (val !== null) {
        const parts = dotPath.split('.');
        let obj = migrated;
        for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
        obj[parts[parts.length - 1]] = parseFloat(val);
        localStorage.removeItem(oldKey);
      }
    }

    localStorage.removeItem('claudia-brain-sim-collapsed');
  } catch {}

  return migrated;
}

// ── Helpers ──────────────────────────────────────────────

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
