/**
 * Claudia Brain Visualizer — Theme Definitions
 *
 * Ten distinct visual themes with complete color palettes.
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

  noirSignal: {
    name: 'Noir Signal',
    description: 'High-contrast black with a single hot accent',
    background: '#0a0a0a',
    entityColors: {
      person: '#f5f0e8',
      organization: '#b8b0a4',
      project: '#d44030',
      concept: '#8c8478',
      location: '#c8c0b4'
    },
    memoryColors: {
      fact: '#d8d0c4',
      commitment: '#d44030',
      learning: '#b8b0a4',
      observation: '#a8a098',
      preference: '#f5f0e8',
      pattern: '#8c8478'
    },
    linkColors: {
      relationship: '#3a3632',
      memoryEntity: '#2a2622',
      memoryEntityAlpha: 0.05,
      highlighted: '#d44030',
      particle: '#5a5248',
      particleHighlight: '#d44030',
      historical: '#1a1816'
    },
    lighting: {
      ambient: { color: '#1a1816', intensity: 0.9 },
      key: { color: '#f5f0e8', intensity: 0.7, position: [150, 250, 150] },
      fill: { color: '#8c8478', intensity: 0.25, position: [-200, -150, 200] },
      accent: { color: '#d44030', intensity: 0.35, position: [0, 100, -200] }
    },
    fog: {
      color: '#0a0a0a',
      density: 0.0005
    },
    ambientParticles: {
      color: '#2a2622'
    },
    nodes: {
      emissiveIntensity: 0.6,
      glowSize: 4,
      glowIntensity: 0.2,
      patternColor: '#8c8478',
      patternEmissive: '#5a5248'
    },
    nebula: {
      enabled: false,
      colors: {
        core: 'rgba(20, 18, 16, 0.15)',
        mid1: 'rgba(15, 13, 12, 0.08)',
        mid2: 'rgba(10, 10, 10, 0.04)',
        edge: 'rgba(10, 10, 10, 0)'
      },
      spots: []
    },
    bloom: {
      strength: 0.6,
      radius: 0.4,
      threshold: 0.3
    },
    starfield: {
      opacity: 0.15,
      brightnessMax: 0.3
    }
  },

  arcticCommand: {
    name: 'Arctic Command',
    description: 'Cool blue-white military ops center',
    background: '#060d14',
    entityColors: {
      person: '#e0f0ff',
      organization: '#5ba4d4',
      project: '#00d4ff',
      concept: '#7890a8',
      location: '#90c8e0'
    },
    memoryColors: {
      fact: '#b0c8d8',
      commitment: '#ff6070',
      learning: '#60d0a0',
      observation: '#7ab8d8',
      preference: '#e0f0ff',
      pattern: '#5890a8'
    },
    linkColors: {
      relationship: '#1a3848',
      memoryEntity: '#0e2838',
      memoryEntityAlpha: 0.06,
      highlighted: '#00d4ff',
      particle: '#2a5868',
      particleHighlight: '#00d4ff',
      historical: '#0a1820'
    },
    lighting: {
      ambient: { color: '#0c1a28', intensity: 0.85 },
      key: { color: '#b0d8f0', intensity: 0.9, position: [150, 250, 150] },
      fill: { color: '#5ba4d4', intensity: 0.35, position: [-200, -150, 200] },
      accent: { color: '#00d4ff', intensity: 0.3, position: [0, 100, -200] }
    },
    fog: {
      color: '#060d14',
      density: 0.0009
    },
    ambientParticles: {
      color: '#1a3848'
    },
    nodes: {
      patternColor: '#5890a8',
      patternEmissive: '#2a4858'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(10, 30, 50, 0.35)',
        mid1: 'rgba(8, 20, 35, 0.2)',
        mid2: 'rgba(6, 14, 24, 0.1)',
        edge: 'rgba(6, 13, 20, 0)'
      },
      spots: [
        { x: 170, y: 200, r: 80, color: '30, 70, 100', alpha: 0.1 },
        { x: 340, y: 280, r: 65, color: '0, 100, 140', alpha: 0.08 },
        { x: 230, y: 150, r: 50, color: '50, 90, 120', alpha: 0.06 }
      ]
    },
    bloom: {
      strength: 1.0,
      radius: 0.6,
      threshold: 0.2
    }
  },

  synthWave: {
    name: 'Synth Wave',
    description: 'Retro-futuristic neon pink and cyan',
    background: '#0d0015',
    entityColors: {
      person: '#ff2a8a',
      organization: '#00e5ff',
      project: '#b040ff',
      concept: '#ffe040',
      location: '#ff7050'
    },
    memoryColors: {
      fact: '#e0c0ff',
      commitment: '#ff2a8a',
      learning: '#00e5ff',
      observation: '#b080ff',
      preference: '#ffe040',
      pattern: '#8040c0'
    },
    linkColors: {
      relationship: '#3a1050',
      memoryEntity: '#280840',
      memoryEntityAlpha: 0.07,
      highlighted: '#ff2a8a',
      particle: '#6030a0',
      particleHighlight: '#00e5ff',
      historical: '#1a0828'
    },
    lighting: {
      ambient: { color: '#18002a', intensity: 0.8 },
      key: { color: '#ff2a8a', intensity: 1.0, position: [150, 250, 150] },
      fill: { color: '#00e5ff', intensity: 0.5, position: [-200, -150, 200] },
      accent: { color: '#b040ff', intensity: 0.4, position: [0, 100, -200] }
    },
    fog: {
      color: '#0d0015',
      density: 0.0007
    },
    ambientParticles: {
      color: '#4020a0'
    },
    nodes: {
      patternColor: '#8040c0',
      patternEmissive: '#5020a0'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(40, 10, 60, 0.4)',
        mid1: 'rgba(25, 5, 40, 0.25)',
        mid2: 'rgba(15, 3, 25, 0.12)',
        edge: 'rgba(13, 0, 21, 0)'
      },
      spots: [
        { x: 160, y: 220, r: 85, color: '180, 40, 120', alpha: 0.15 },
        { x: 330, y: 270, r: 70, color: '0, 120, 180', alpha: 0.12 },
        { x: 240, y: 140, r: 55, color: '140, 50, 200', alpha: 0.1 }
      ]
    },
    bloom: {
      strength: 1.6,
      radius: 0.85,
      threshold: 0.15
    },
    starfield: {
      opacity: 0.5,
      brightnessMax: 0.8
    }
  },

  copperPatina: {
    name: 'Copper Patina',
    description: 'Warm industrial copper and oxidized teal',
    background: '#0c0a08',
    entityColors: {
      person: '#e8a050',
      organization: '#c08030',
      project: '#40a098',
      concept: '#f0dcc0',
      location: '#d0a868'
    },
    memoryColors: {
      fact: '#d8c8a8',
      commitment: '#d05838',
      learning: '#50b0a0',
      observation: '#c8a870',
      preference: '#e8a050',
      pattern: '#70988c'
    },
    linkColors: {
      relationship: '#3a2e20',
      memoryEntity: '#2a2018',
      memoryEntityAlpha: 0.06,
      highlighted: '#e8a050',
      particle: '#5a4830',
      particleHighlight: '#40a098',
      historical: '#1a1410'
    },
    lighting: {
      ambient: { color: '#201810', intensity: 0.8 },
      key: { color: '#e8a050', intensity: 0.9, position: [150, 250, 150] },
      fill: { color: '#40a098', intensity: 0.35, position: [-200, -150, 200] },
      accent: { color: '#c08030', intensity: 0.3, position: [0, 100, -200] }
    },
    fog: {
      color: '#0c0a08',
      density: 0.0008
    },
    ambientParticles: {
      color: '#3a2e20'
    },
    nodes: {
      patternColor: '#70988c',
      patternEmissive: '#406058'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(40, 28, 15, 0.35)',
        mid1: 'rgba(28, 20, 10, 0.2)',
        mid2: 'rgba(18, 14, 8, 0.1)',
        edge: 'rgba(12, 10, 8, 0)'
      },
      spots: [
        { x: 180, y: 210, r: 80, color: '160, 100, 40', alpha: 0.12 },
        { x: 320, y: 290, r: 65, color: '50, 120, 110', alpha: 0.1 },
        { x: 240, y: 150, r: 50, color: '180, 120, 50', alpha: 0.08 }
      ]
    },
    bloom: {
      strength: 0.9,
      radius: 0.6,
      threshold: 0.25
    }
  },

  phosphorTerminal: {
    name: 'Phosphor Terminal',
    description: 'Green-on-black CRT monitor glow',
    background: '#020804',
    entityColors: {
      person: '#30ff60',
      organization: '#20c848',
      project: '#d0a020',
      concept: '#18a040',
      location: '#60e870'
    },
    memoryColors: {
      fact: '#40d060',
      commitment: '#d0a020',
      learning: '#28e850',
      observation: '#38c058',
      preference: '#30ff60',
      pattern: '#188830'
    },
    linkColors: {
      relationship: '#0a3010',
      memoryEntity: '#082008',
      memoryEntityAlpha: 0.06,
      highlighted: '#30ff60',
      particle: '#104018',
      particleHighlight: '#30ff60',
      historical: '#041808'
    },
    lighting: {
      ambient: { color: '#041808', intensity: 0.7 },
      key: { color: '#30ff60', intensity: 0.8, position: [150, 250, 150] },
      fill: { color: '#20c848', intensity: 0.3, position: [-200, -150, 200] },
      accent: { color: '#d0a020', intensity: 0.25, position: [0, 100, -200] }
    },
    fog: {
      color: '#020804',
      density: 0.0012
    },
    ambientParticles: {
      color: '#0a3010'
    },
    nodes: {
      patternColor: '#188830',
      patternEmissive: '#105020'
    },
    nebula: {
      enabled: true,
      colors: {
        core: 'rgba(8, 30, 12, 0.3)',
        mid1: 'rgba(5, 20, 8, 0.18)',
        mid2: 'rgba(3, 12, 5, 0.08)',
        edge: 'rgba(2, 8, 4, 0)'
      },
      spots: [
        { x: 170, y: 200, r: 75, color: '20, 120, 40', alpha: 0.1 },
        { x: 330, y: 280, r: 60, color: '30, 160, 50', alpha: 0.08 },
        { x: 230, y: 160, r: 50, color: '160, 120, 20', alpha: 0.06 }
      ]
    },
    bloom: {
      strength: 1.5,
      radius: 0.8,
      threshold: 0.18
    },
    starfield: {
      opacity: 0.2,
      brightnessMax: 0.4
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
