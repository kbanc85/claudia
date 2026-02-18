/**
 * Claudia Brain -- Theme system
 *
 * 10 color themes with live switching. Each theme defines CSS variables,
 * 3D node colors, bloom parameters, emissive intensities, and link styling.
 *
 * Selective bloom: entity emissiveIntensity (0.3-0.5) sits ABOVE the bloom
 * threshold (0.08-0.20), so entities glow. Memory emissiveIntensity (0.02-0.06)
 * sits BELOW the threshold, so they stay subdued. No Three.js Layers needed.
 */

const listeners = [];

let activeThemeId = 'deep-space';

// ── Theme definitions ─────────────────────────────────────

const THEMES = {
  'deep-space': {
    id: 'deep-space',
    name: 'Deep Space',
    swatch: '#818cf8',
    background: '#000008',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#050510',
      '--surface': 'rgba(8, 8, 20, 0.88)',
      '--surface-hover': 'rgba(12, 12, 30, 0.92)',
      '--border': 'rgba(100, 110, 240, 0.08)',
      '--border-bright': 'rgba(100, 110, 240, 0.15)',
      '--text': '#c8c8e0',
      '--text-bright': '#e8e8f8',
      '--text-dim': '#606080',
      '--accent': '#818cf8',
      '--accent-glow': 'rgba(129, 140, 248, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#60a5fa',
      project: '#34d399',
      concept: '#c084fc',
      location: '#fb923c',
    },
    memories: {
      fact: '#e2e8f0',
      commitment: '#f87171',
      learning: '#4ade80',
      observation: '#93c5fd',
      preference: '#fbbf24',
      pattern: '#a78bfa',
    },
    pattern: { color: '#a78bfa', emissive: '#7c3aed' },
    links: {
      relationship: 'rgba(130, 140, 248, 0.4)',
      memoryEntity: 'rgba(120, 140, 255, 0.08)',
      highlight: 'rgba(125, 211, 252, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(140, 150, 255, 0.12)',
    },
    particles: {
      strong: '#00ffaa',
      normal: '#818cf8',
    },
    bloom: { strength: 2.0, radius: 1.0, threshold: 0.12 },
    emissive: { entity: 0.35, memory: 0.04, pattern: 0.5 },
  },

  'nebula': {
    id: 'nebula',
    name: 'Nebula',
    swatch: '#d946ef',
    background: '#0a0012',
    defaultCamera: 'cinematic',
    css: {
      '--bg': '#08000f',
      '--surface': 'rgba(16, 4, 24, 0.90)',
      '--surface-hover': 'rgba(24, 8, 36, 0.92)',
      '--border': 'rgba(180, 60, 220, 0.08)',
      '--border-bright': 'rgba(180, 60, 220, 0.18)',
      '--text': '#dcc8e8',
      '--text-bright': '#f0e0ff',
      '--text-dim': '#705880',
      '--accent': '#d946ef',
      '--accent-glow': 'rgba(217, 70, 239, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#2dd4bf',
      project: '#34d399',
      concept: '#e879f9',
      location: '#fb7185',
    },
    memories: {
      fact: '#f5e6d3',
      commitment: '#fb7185',
      learning: '#86efac',
      observation: '#c4b5fd',
      preference: '#fbbf24',
      pattern: '#e879f9',
    },
    pattern: { color: '#e879f9', emissive: '#a21caf' },
    links: {
      relationship: 'rgba(217, 70, 239, 0.35)',
      memoryEntity: 'rgba(160, 80, 200, 0.08)',
      highlight: 'rgba(240, 171, 252, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(180, 100, 220, 0.12)',
    },
    particles: {
      strong: '#f0abfc',
      normal: '#d946ef',
    },
    bloom: { strength: 2.2, radius: 1.1, threshold: 0.10 },
    emissive: { entity: 0.40, memory: 0.04, pattern: 0.55 },
  },

  'bioluminescent': {
    id: 'bioluminescent',
    name: 'Bioluminescent',
    swatch: '#06b6d4',
    background: '#000a0d',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#000809',
      '--surface': 'rgba(2, 14, 18, 0.90)',
      '--surface-hover': 'rgba(4, 20, 26, 0.92)',
      '--border': 'rgba(6, 182, 212, 0.08)',
      '--border-bright': 'rgba(6, 182, 212, 0.18)',
      '--text': '#b8dce8',
      '--text-bright': '#d4f0f8',
      '--text-dim': '#4a7080',
      '--accent': '#06b6d4',
      '--accent-glow': 'rgba(6, 182, 212, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#22d3ee',
      project: '#a3e635',
      concept: '#fb7185',
      location: '#2dd4bf',
    },
    memories: {
      fact: '#e2e8f0',
      commitment: '#fb7185',
      learning: '#86efac',
      observation: '#7dd3fc',
      preference: '#fbbf24',
      pattern: '#2dd4bf',
    },
    pattern: { color: '#2dd4bf', emissive: '#0d9488' },
    links: {
      relationship: 'rgba(6, 182, 212, 0.35)',
      memoryEntity: 'rgba(6, 182, 212, 0.06)',
      highlight: 'rgba(103, 232, 249, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(6, 182, 212, 0.10)',
    },
    particles: {
      strong: '#4ade80',
      normal: '#06b6d4',
    },
    bloom: { strength: 2.0, radius: 1.0, threshold: 0.10 },
    emissive: { entity: 0.38, memory: 0.04, pattern: 0.5 },
  },

  'ember': {
    id: 'ember',
    name: 'Ember',
    swatch: '#f97316',
    background: '#0a0400',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#080400',
      '--surface': 'rgba(18, 10, 4, 0.90)',
      '--surface-hover': 'rgba(26, 16, 6, 0.92)',
      '--border': 'rgba(249, 115, 22, 0.08)',
      '--border-bright': 'rgba(249, 115, 22, 0.18)',
      '--text': '#e8d0b8',
      '--text-bright': '#f8e8d4',
      '--text-dim': '#806850',
      '--accent': '#f97316',
      '--accent-glow': 'rgba(249, 115, 22, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#f97316',
      project: '#2dd4bf',
      concept: '#fb7185',
      location: '#fde68a',
    },
    memories: {
      fact: '#d4c0a0',
      commitment: '#fb7185',
      learning: '#a3e635',
      observation: '#fdba74',
      preference: '#fde68a',
      pattern: '#c084fc',
    },
    pattern: { color: '#f97316', emissive: '#c2410c' },
    links: {
      relationship: 'rgba(249, 115, 22, 0.35)',
      memoryEntity: 'rgba(249, 115, 22, 0.06)',
      highlight: 'rgba(251, 191, 36, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(249, 115, 22, 0.10)',
    },
    particles: {
      strong: '#fbbf24',
      normal: '#f97316',
    },
    bloom: { strength: 2.2, radius: 1.0, threshold: 0.12 },
    emissive: { entity: 0.40, memory: 0.05, pattern: 0.5 },
  },

  'arctic': {
    id: 'arctic',
    name: 'Arctic',
    swatch: '#38bdf8',
    background: '#020810',
    defaultCamera: 'cinematic',
    css: {
      '--bg': '#020610',
      '--surface': 'rgba(4, 10, 24, 0.90)',
      '--surface-hover': 'rgba(8, 16, 32, 0.92)',
      '--border': 'rgba(56, 189, 248, 0.08)',
      '--border-bright': 'rgba(56, 189, 248, 0.18)',
      '--text': '#c8dce8',
      '--text-bright': '#e0f0f8',
      '--text-dim': '#506878',
      '--accent': '#38bdf8',
      '--accent-glow': 'rgba(56, 189, 248, 0.2)',
    },
    entities: {
      person: '#fde68a',
      organization: '#7dd3fc',
      project: '#86efac',
      concept: '#c4b5fd',
      location: '#fdba74',
    },
    memories: {
      fact: '#e2e8f0',
      commitment: '#fb7185',
      learning: '#86efac',
      observation: '#bae6fd',
      preference: '#fbbf24',
      pattern: '#c4b5fd',
    },
    pattern: { color: '#7dd3fc', emissive: '#0284c7' },
    links: {
      relationship: 'rgba(56, 189, 248, 0.30)',
      memoryEntity: 'rgba(56, 189, 248, 0.06)',
      highlight: 'rgba(224, 242, 254, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(56, 189, 248, 0.10)',
    },
    particles: {
      strong: '#e0f2fe',
      normal: '#38bdf8',
    },
    bloom: { strength: 1.8, radius: 0.9, threshold: 0.14 },
    emissive: { entity: 0.35, memory: 0.04, pattern: 0.45 },
  },

  'matrix': {
    id: 'matrix',
    name: 'Matrix',
    swatch: '#22c55e',
    background: '#000200',
    defaultCamera: 'pulse',
    css: {
      '--bg': '#000200',
      '--surface': 'rgba(0, 6, 2, 0.92)',
      '--surface-hover': 'rgba(0, 12, 4, 0.94)',
      '--border': 'rgba(34, 197, 94, 0.08)',
      '--border-bright': 'rgba(34, 197, 94, 0.18)',
      '--text': '#a8d8b8',
      '--text-bright': '#c8f0d4',
      '--text-dim': '#406848',
      '--accent': '#22c55e',
      '--accent-glow': 'rgba(34, 197, 94, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#22c55e',
      project: '#60a5fa',
      concept: '#ef4444',
      location: '#fb923c',
    },
    memories: {
      fact: '#8a9a8e',
      commitment: '#fb7185',
      learning: '#a3e635',
      observation: '#2dd4bf',
      preference: '#fde68a',
      pattern: '#22c55e',
    },
    pattern: { color: '#22c55e', emissive: '#15803d' },
    links: {
      relationship: 'rgba(34, 197, 94, 0.35)',
      memoryEntity: 'rgba(34, 197, 94, 0.06)',
      highlight: 'rgba(134, 239, 172, 0.9)',
      historical: 'rgba(255, 255, 255, 0.03)',
      default: 'rgba(34, 197, 94, 0.10)',
    },
    particles: {
      strong: '#86efac',
      normal: '#22c55e',
    },
    bloom: { strength: 2.5, radius: 0.8, threshold: 0.08 },
    emissive: { entity: 0.45, memory: 0.03, pattern: 0.55 },
  },

  'sunset': {
    id: 'sunset',
    name: 'Sunset',
    swatch: '#f43f5e',
    background: '#080206',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#060204',
      '--surface': 'rgba(16, 6, 12, 0.90)',
      '--surface-hover': 'rgba(24, 10, 18, 0.92)',
      '--border': 'rgba(244, 63, 94, 0.08)',
      '--border-bright': 'rgba(244, 63, 94, 0.18)',
      '--text': '#e8c8d4',
      '--text-bright': '#f8e0e8',
      '--text-dim': '#805868',
      '--accent': '#f43f5e',
      '--accent-glow': 'rgba(244, 63, 94, 0.2)',
    },
    entities: {
      person: '#fb923c',
      organization: '#f43f5e',
      project: '#a78bfa',
      concept: '#f472b6',
      location: '#fbbf24',
    },
    memories: {
      fact: '#d4b8c4',
      commitment: '#f43f5e',
      learning: '#86efac',
      observation: '#c4b5fd',
      preference: '#fdba74',
      pattern: '#a78bfa',
    },
    pattern: { color: '#c084fc', emissive: '#7c3aed' },
    links: {
      relationship: 'rgba(244, 63, 94, 0.35)',
      memoryEntity: 'rgba(244, 63, 94, 0.06)',
      highlight: 'rgba(251, 146, 60, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(244, 63, 94, 0.10)',
    },
    particles: {
      strong: '#fb923c',
      normal: '#f43f5e',
    },
    bloom: { strength: 2.0, radius: 1.0, threshold: 0.12 },
    emissive: { entity: 0.38, memory: 0.05, pattern: 0.50 },
  },

  'monochrome': {
    id: 'monochrome',
    name: 'Monochrome',
    swatch: '#a1a1aa',
    background: '#000000',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#000000',
      '--surface': 'rgba(10, 10, 10, 0.92)',
      '--surface-hover': 'rgba(18, 18, 18, 0.94)',
      '--border': 'rgba(161, 161, 170, 0.08)',
      '--border-bright': 'rgba(161, 161, 170, 0.18)',
      '--text': '#b8b8c0',
      '--text-bright': '#e0e0e4',
      '--text-dim': '#585860',
      '--accent': '#a1a1aa',
      '--accent-glow': 'rgba(161, 161, 170, 0.2)',
    },
    entities: {
      person: '#e4e4e7',
      organization: '#a1a1aa',
      project: '#d4d4d8',
      concept: '#f4f4f5',
      location: '#71717a',
    },
    memories: {
      fact: '#8a8a90',
      commitment: '#d4d4d8',
      learning: '#a1a1aa',
      observation: '#b8b8c0',
      preference: '#e4e4e7',
      pattern: '#71717a',
    },
    pattern: { color: '#a1a1aa', emissive: '#52525b' },
    links: {
      relationship: 'rgba(161, 161, 170, 0.30)',
      memoryEntity: 'rgba(161, 161, 170, 0.06)',
      highlight: 'rgba(244, 244, 245, 0.9)',
      historical: 'rgba(255, 255, 255, 0.03)',
      default: 'rgba(161, 161, 170, 0.10)',
    },
    particles: {
      strong: '#e4e4e7',
      normal: '#a1a1aa',
    },
    bloom: { strength: 1.8, radius: 0.8, threshold: 0.15 },
    emissive: { entity: 0.32, memory: 0.04, pattern: 0.40 },
  },

  'sakura': {
    id: 'sakura',
    name: 'Sakura',
    swatch: '#f9a8d4',
    background: '#060408',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#040308',
      '--surface': 'rgba(12, 8, 16, 0.90)',
      '--surface-hover': 'rgba(20, 12, 24, 0.92)',
      '--border': 'rgba(249, 168, 212, 0.08)',
      '--border-bright': 'rgba(249, 168, 212, 0.18)',
      '--text': '#e0c8d8',
      '--text-bright': '#f4e0ec',
      '--text-dim': '#705868',
      '--accent': '#f9a8d4',
      '--accent-glow': 'rgba(249, 168, 212, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#f9a8d4',
      project: '#2dd4bf',
      concept: '#fbcfe8',
      location: '#c4b5fd',
    },
    memories: {
      fact: '#c8b0b8',
      commitment: '#fb7185',
      learning: '#86efac',
      observation: '#f9a8d4',
      preference: '#fde68a',
      pattern: '#c4b5fd',
    },
    pattern: { color: '#f0abfc', emissive: '#a21caf' },
    links: {
      relationship: 'rgba(249, 168, 212, 0.30)',
      memoryEntity: 'rgba(249, 168, 212, 0.06)',
      highlight: 'rgba(252, 231, 243, 0.9)',
      historical: 'rgba(255, 255, 255, 0.04)',
      default: 'rgba(249, 168, 212, 0.10)',
    },
    particles: {
      strong: '#fbcfe8',
      normal: '#f9a8d4',
    },
    bloom: { strength: 1.8, radius: 1.0, threshold: 0.14 },
    emissive: { entity: 0.35, memory: 0.05, pattern: 0.45 },
  },

  'void': {
    id: 'void',
    name: 'Void',
    swatch: '#6366f1',
    background: '#000000',
    defaultCamera: 'pulse',
    css: {
      '--bg': '#000000',
      '--surface': 'rgba(4, 4, 8, 0.94)',
      '--surface-hover': 'rgba(8, 8, 16, 0.96)',
      '--border': 'rgba(99, 102, 241, 0.06)',
      '--border-bright': 'rgba(99, 102, 241, 0.14)',
      '--text': '#9898b8',
      '--text-bright': '#c0c0d8',
      '--text-dim': '#404058',
      '--accent': '#6366f1',
      '--accent-glow': 'rgba(99, 102, 241, 0.15)',
    },
    entities: {
      person: '#7dd3fc',
      organization: '#818cf8',
      project: '#2dd4bf',
      concept: '#c4b5fd',
      location: '#8b5cf6',
    },
    memories: {
      fact: '#7080a0',
      commitment: '#fb7185',
      learning: '#e2e8f0',
      observation: '#a5b4fc',
      preference: '#fbbf24',
      pattern: '#818cf8',
    },
    pattern: { color: '#6366f1', emissive: '#4338ca' },
    links: {
      relationship: 'rgba(99, 102, 241, 0.25)',
      memoryEntity: 'rgba(99, 102, 241, 0.04)',
      highlight: 'rgba(165, 180, 252, 0.9)',
      historical: 'rgba(255, 255, 255, 0.02)',
      default: 'rgba(99, 102, 241, 0.08)',
    },
    particles: {
      strong: '#a5b4fc',
      normal: '#6366f1',
    },
    bloom: { strength: 3.0, radius: 1.2, threshold: 0.08 },
    emissive: { entity: 0.50, memory: 0.02, pattern: 0.60 },
  },
};

// ── Public API ───────────────────────────────────────────

export function getThemes() {
  return THEMES;
}

export function getTheme(id) {
  return THEMES[id] || THEMES['deep-space'];
}

export function getActiveTheme() {
  return THEMES[activeThemeId] || THEMES['deep-space'];
}

export function getActiveThemeId() {
  return activeThemeId;
}

export function setActiveTheme(id) {
  if (!THEMES[id]) return;
  activeThemeId = id;
  applyCSS(THEMES[id]);
  for (const cb of listeners) {
    try { cb(THEMES[id]); } catch (e) { console.warn('Theme listener error:', e); }
  }
}

export function onThemeChange(callback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ── CSS variable application ─────────────────────────────

function applyCSS(theme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.css)) {
    root.style.setProperty(prop, value);
  }
}
