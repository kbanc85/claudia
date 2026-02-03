/**
 * Claudia Brain Visualizer — Theme Definitions
 *
 * Five distinct visual themes with complete color palettes.
 * Use applyTheme(themeName) to apply a theme to the config.
 */

import { config, notifyConfigUpdate } from './config.js';

// ── Theme Definitions ────────────────────────────────────────

export const themes = {
  midnight: {
    name: 'Midnight',
    description: 'Deep space with vibrant accents (default)',
    background: '#050510',
    entityColors: {
      person: '#fbbf24',
      organization: '#60a5fa',
      project: '#34d399',
      concept: '#c084fc',
      location: '#fb923c'
    },
    memoryColors: {
      fact: '#e2e8f0',
      commitment: '#f87171',
      learning: '#4ade80',
      observation: '#93c5fd',
      preference: '#fbbf24',
      pattern: '#a78bfa'
    },
    linkColors: {
      relationship: '#8ca0ff',
      memoryEntity: '#7890ff',
      memoryEntityAlpha: 0.06,
      highlighted: '#7dd3fc',
      particle: '#b4b4ff',
      particleHighlight: '#7dd3fc',
      historical: '#ffffff',
      memoryEntityByType: {
        fact: '#94a3b8',
        commitment: '#f87171',
        learning: '#4ade80',
        observation: '#93c5fd',
        preference: '#fbbf24',
        pattern: '#a78bfa'
      }
    },
    lighting: {
      ambient: { color: '#1a1a3e', intensity: 0.8 },
      key: { color: '#6366f1', intensity: 1.0, position: [150, 250, 150] },
      fill: { color: '#0ea5e9', intensity: 0.5, position: [-200, -150, 200] },
      accent: { color: '#f59e0b', intensity: 0.3, position: [0, 100, -200] }
    },
    fog: {
      color: '#050510',
      density: 0.0008
    },
    ambientParticles: {
      color: '#6366f1'
    },
    nodes: {
      emissiveIntensity: 0.5,
      glowSize: 6,
      glowIntensity: 0.45,
      patternColor: '#a78bfa',
      patternEmissive: '#7c3aed'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(30, 20, 60, 0.4)',
        mid1: 'rgba(15, 12, 40, 0.2)',
        mid2: 'rgba(8, 8, 25, 0.1)',
        edge: 'rgba(5, 5, 16, 0)'
      },
      spots: [
        { x: 150, y: 200, r: 80, color: '60, 50, 140', alpha: 0.15 },
        { x: 350, y: 300, r: 60, color: '20, 80, 120', alpha: 0.15 },
        { x: 250, y: 150, r: 50, color: '100, 40, 80', alpha: 0.15 }
      ]
    },
    links: {
      curvature: 0.22
    },
    bloom: {
      strength: 1.2,
      radius: 0.3,
      threshold: 0.1
    },
    camera: {
      fov: 90,
      idleTimeout: 2000
    },
    starfield: {
      opacity: 0.3
    }
  },

  oceanDeep: {
    name: 'Ocean Deep',
    description: 'Bioluminescent sea creatures in the abyss',
    background: '#020b14',
    entityColors: {
      person: '#22d3ee',
      organization: '#0ea5e9',
      project: '#2dd4bf',
      concept: '#a78bfa',
      location: '#fb7185'
    },
    memoryColors: {
      fact: '#94a3b8',
      commitment: '#f472b6',
      learning: '#34d399',
      observation: '#7dd3fc',
      preference: '#22d3ee',
      pattern: '#c4b5fd'
    },
    linkColors: {
      relationship: '#38bdf8',
      memoryEntity: '#0891b2',
      memoryEntityAlpha: 0.08,
      highlighted: '#5eead4',
      particle: '#67e8f9',
      particleHighlight: '#5eead4',
      historical: '#64748b'
    },
    lighting: {
      ambient: { color: '#0c2942', intensity: 0.9 },
      key: { color: '#22d3ee', intensity: 1.0, position: [150, 250, 150] },
      fill: { color: '#0ea5e9', intensity: 0.4, position: [-200, -150, 200] },
      accent: { color: '#f0abfc', intensity: 0.25, position: [0, 100, -200] }
    },
    fog: {
      color: '#020b14',
      density: 0.001
    },
    ambientParticles: {
      color: '#0891b2'
    },
    nodes: {
      patternColor: '#c4b5fd',
      patternEmissive: '#8b5cf6'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(8, 51, 68, 0.4)',
        mid1: 'rgba(6, 30, 45, 0.25)',
        mid2: 'rgba(4, 18, 30, 0.15)',
        edge: 'rgba(2, 11, 20, 0)'
      },
      spots: [
        { x: 180, y: 220, r: 90, color: '8, 145, 178', alpha: 0.12 },
        { x: 320, y: 280, r: 70, color: '14, 165, 233', alpha: 0.1 },
        { x: 220, y: 160, r: 55, color: '240, 171, 252', alpha: 0.08 }
      ]
    },
    bloom: {
      strength: 1.4,
      radius: 0.9,
      threshold: 0.25
    }
  },

  sunsetEmber: {
    name: 'Sunset Ember',
    description: 'Warm twilight with glowing embers',
    background: '#0f0805',
    entityColors: {
      person: '#fcd34d',
      organization: '#fb923c',
      project: '#f472b6',
      concept: '#c084fc',
      location: '#fbbf24'
    },
    memoryColors: {
      fact: '#fef3c7',
      commitment: '#ef4444',
      learning: '#86efac',
      observation: '#fdba74',
      preference: '#fcd34d',
      pattern: '#d8b4fe'
    },
    linkColors: {
      relationship: '#fdba74',
      memoryEntity: '#f97316',
      memoryEntityAlpha: 0.08,
      highlighted: '#fbbf24',
      particle: '#fed7aa',
      particleHighlight: '#fcd34d',
      historical: '#78716c'
    },
    lighting: {
      ambient: { color: '#2d1810', intensity: 0.8 },
      key: { color: '#f97316', intensity: 1.1, position: [150, 250, 150] },
      fill: { color: '#f472b6', intensity: 0.4, position: [-200, -150, 200] },
      accent: { color: '#fcd34d', intensity: 0.3, position: [0, 100, -200] }
    },
    fog: {
      color: '#0f0805',
      density: 0.0009
    },
    ambientParticles: {
      color: '#f97316'
    },
    nodes: {
      patternColor: '#d8b4fe',
      patternEmissive: '#a855f7'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(60, 20, 10, 0.4)',
        mid1: 'rgba(40, 15, 8, 0.25)',
        mid2: 'rgba(25, 10, 5, 0.15)',
        edge: 'rgba(15, 8, 5, 0)'
      },
      spots: [
        { x: 160, y: 190, r: 85, color: '249, 115, 22', alpha: 0.15 },
        { x: 340, y: 310, r: 65, color: '244, 114, 182', alpha: 0.12 },
        { x: 240, y: 140, r: 50, color: '252, 211, 77', alpha: 0.1 }
      ]
    },
    bloom: {
      strength: 1.6,
      radius: 0.85,
      threshold: 0.28
    }
  },

  forestCanopy: {
    name: 'Forest Canopy',
    description: 'Moonlit forest with fireflies',
    background: '#030806',
    entityColors: {
      person: '#86efac',
      organization: '#22c55e',
      project: '#fbbf24',
      concept: '#a3e635',
      location: '#d9f99d'
    },
    memoryColors: {
      fact: '#d1fae5',
      commitment: '#f87171',
      learning: '#4ade80',
      observation: '#bbf7d0',
      preference: '#fbbf24',
      pattern: '#bef264'
    },
    linkColors: {
      relationship: '#4ade80',
      memoryEntity: '#16a34a',
      memoryEntityAlpha: 0.07,
      highlighted: '#fbbf24',
      particle: '#86efac',
      particleHighlight: '#fbbf24',
      historical: '#6b7280'
    },
    lighting: {
      ambient: { color: '#0a2615', intensity: 0.7 },
      key: { color: '#22c55e', intensity: 0.9, position: [150, 250, 150] },
      fill: { color: '#86efac', intensity: 0.4, position: [-200, -150, 200] },
      accent: { color: '#fbbf24', intensity: 0.35, position: [0, 100, -200] }
    },
    fog: {
      color: '#030806',
      density: 0.0012
    },
    ambientParticles: {
      color: '#16a34a'
    },
    nodes: {
      patternColor: '#bef264',
      patternEmissive: '#84cc16'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(10, 40, 20, 0.4)',
        mid1: 'rgba(6, 28, 14, 0.25)',
        mid2: 'rgba(4, 16, 8, 0.15)',
        edge: 'rgba(3, 8, 6, 0)'
      },
      spots: [
        { x: 170, y: 210, r: 75, color: '34, 197, 94', alpha: 0.12 },
        { x: 330, y: 290, r: 60, color: '251, 191, 36', alpha: 0.15 },
        { x: 230, y: 150, r: 45, color: '134, 239, 172', alpha: 0.1 }
      ]
    },
    bloom: {
      strength: 1.3,
      radius: 0.7,
      threshold: 0.35
    }
  },

  monochromePro: {
    name: 'Monochrome Pro',
    description: 'Clean, professional, minimal distraction',
    background: '#09090b',
    entityColors: {
      person: '#fafafa',
      organization: '#a1a1aa',
      project: '#71717a',
      concept: '#52525b',
      location: '#d4d4d8'
    },
    memoryColors: {
      fact: '#e4e4e7',
      commitment: '#ef4444',
      learning: '#a1a1aa',
      observation: '#d4d4d8',
      preference: '#fafafa',
      pattern: '#71717a'
    },
    linkColors: {
      relationship: '#3f3f46',
      memoryEntity: '#27272a',
      memoryEntityAlpha: 0.05,
      highlighted: '#3b82f6',
      particle: '#52525b',
      particleHighlight: '#3b82f6',
      historical: '#27272a'
    },
    lighting: {
      ambient: { color: '#18181b', intensity: 1.0 },
      key: { color: '#f4f4f5', intensity: 0.8, position: [150, 250, 150] },
      fill: { color: '#a1a1aa', intensity: 0.3, position: [-200, -150, 200] },
      accent: { color: '#3b82f6', intensity: 0.2, position: [0, 100, -200] }
    },
    fog: {
      color: '#09090b',
      density: 0.0006
    },
    ambientParticles: {
      color: '#27272a'
    },
    nodes: {
      patternColor: '#71717a',
      patternEmissive: '#3f3f46'
    },
    nebula: {
      enabled: false,
      colors: {
        core: 'rgba(20, 20, 22, 0.2)',
        mid1: 'rgba(15, 15, 17, 0.1)',
        mid2: 'rgba(10, 10, 12, 0.05)',
        edge: 'rgba(9, 9, 11, 0)'
      },
      spots: []
    },
    bloom: {
      strength: 0.8,
      radius: 0.5,
      threshold: 0.4
    },
    starfield: {
      opacity: 0.3,
      brightnessMax: 0.5
    }
  }
};

// ── Theme Application ────────────────────────────────────────

/**
 * Apply a theme by merging its values into config
 * @param {string} themeName - Theme key (midnight, oceanDeep, etc.)
 * @returns {boolean} True if theme was applied
 */
export function applyTheme(themeName) {
  const theme = themes[themeName];
  if (!theme) {
    console.warn(`Theme "${themeName}" not found`);
    return false;
  }

  // Store current theme name
  config.theme = themeName;

  // Merge theme colors into config
  config.background = theme.background;

  // Entity colors
  Object.assign(config.entityColors, theme.entityColors);

  // Memory colors
  Object.assign(config.memoryColors, theme.memoryColors);

  // Link colors
  Object.assign(config.linkColors, theme.linkColors);

  // Lighting
  config.lighting.ambient.color = theme.lighting.ambient.color;
  config.lighting.ambient.intensity = theme.lighting.ambient.intensity;
  config.lighting.key.color = theme.lighting.key.color;
  config.lighting.key.intensity = theme.lighting.key.intensity;
  config.lighting.fill.color = theme.lighting.fill.color;
  config.lighting.fill.intensity = theme.lighting.fill.intensity;
  config.lighting.accent.color = theme.lighting.accent.color;
  config.lighting.accent.intensity = theme.lighting.accent.intensity;

  // Fog
  Object.assign(config.fog, theme.fog);

  // Ambient particles
  config.ambientParticles.color = theme.ambientParticles.color;

  // Nodes (pattern colors + visual settings)
  if (theme.nodes) {
    if (theme.nodes.patternColor) config.nodes.patternColor = theme.nodes.patternColor;
    if (theme.nodes.patternEmissive) config.nodes.patternEmissive = theme.nodes.patternEmissive;
    if (theme.nodes.emissiveIntensity !== undefined) config.nodes.emissiveIntensity = theme.nodes.emissiveIntensity;
    if (theme.nodes.glowSize !== undefined) config.nodes.glowSize = theme.nodes.glowSize;
    if (theme.nodes.glowIntensity !== undefined) config.nodes.glowIntensity = theme.nodes.glowIntensity;
  }

  // Links
  if (theme.links) {
    if (theme.links.curvature !== undefined) config.links.curvature = theme.links.curvature;
  }

  // Camera
  if (theme.camera) {
    if (theme.camera.fov !== undefined) config.camera.fov = theme.camera.fov;
    if (theme.camera.idleTimeout !== undefined) config.camera.idleTimeout = theme.camera.idleTimeout;
  }

  // Nebula
  if (theme.nebula) {
    config.nebula.enabled = theme.nebula.enabled;
    Object.assign(config.nebula.colors, theme.nebula.colors);
    config.nebula.spots = theme.nebula.spots;
  }

  // Bloom
  Object.assign(config.bloom, theme.bloom);

  // Starfield (if theme specifies)
  if (theme.starfield) {
    Object.assign(config.starfield, theme.starfield);
  }

  console.log(`Applied theme: ${theme.name}`);

  // Notify all listeners
  notifyConfigUpdate('*');

  return true;
}

/**
 * Get available theme names
 * @returns {string[]} Array of theme keys
 */
export function getThemeNames() {
  return Object.keys(themes);
}

/**
 * Get theme display info
 * @returns {Array<{key: string, name: string, description: string}>}
 */
export function getThemeList() {
  return Object.entries(themes).map(([key, theme]) => ({
    key,
    name: theme.name,
    description: theme.description
  }));
}

/**
 * Get current theme name
 * @returns {string}
 */
export function getCurrentTheme() {
  return config.theme || 'midnight';
}

/**
 * Save theme preference to localStorage
 * @param {string} themeName
 */
export function saveThemePreference(themeName) {
  try {
    localStorage.setItem('claudia-brain-theme', themeName);
  } catch (e) {
    console.warn('Could not save theme preference:', e);
  }
}

/**
 * Load theme preference from localStorage
 * @returns {string|null}
 */
export function loadThemePreference() {
  try {
    return localStorage.getItem('claudia-brain-theme');
  } catch (e) {
    return null;
  }
}
