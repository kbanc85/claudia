/**
 * Claudia Brain v4 -- Theme system
 *
 * 10 deeply crafted themes, each embodying a distinct aesthetic pillar.
 * Themes control colors, bloom, atmosphere, particles, and UI styling.
 *
 * Selective bloom: entity emissiveIntensity sits ABOVE bloom threshold (glow).
 * Memory emissiveIntensity sits BELOW threshold (subdued). No Layers needed.
 */

const listeners = [];
let activeThemeId = 'deep-ocean';

// ── Theme definitions ────────────────────────────────────

const THEMES = {

  // ─── 1. DEEP OCEAN ──────────────────────────────────────
  // Bioluminescent jellyfish drifting through midnight water.
  // Cyan/teal dominant with warm gold accents.
  'deep-ocean': {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    description: 'Bioluminescent creatures in dark water',
    swatch: '#06b6d4',
    background: '#000a0d',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#000809',
      '--surface': 'rgba(2, 14, 18, 0.85)',
      '--surface-hover': 'rgba(4, 20, 26, 0.90)',
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
      relationship: 'rgba(6, 182, 212, 0.50)',
      memoryEntity: 'rgba(6, 182, 212, 0.15)',
      highlight: 'rgba(103, 232, 249, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(6, 182, 212, 0.18)',
    },
    particles: { strong: '#4ade80', normal: '#06b6d4' },
    bloom: { strength: 1.4, radius: 0.75, threshold: 0.10 },
    emissive: { entity: 0.38, memory: 0.04, pattern: 0.5 },
    atmosphere: {
      fogColor: '#000a0e',
      fogNear: 300, fogFar: 1800, fogDensity: 0.0004,
      ambientColor: '#06b6d4', ambientCount: 400,
      ambientSize: 0.15, ambientSpeed: 0.08,
    },
    noise: { vertexDisplacement: 0.06, vertexFrequency: 2.0, vertexSpeed: 0.3 },
  },

  // ─── 2. NEURAL ──────────────────────────────────────────
  // Living brain tissue under fluorescence microscopy.
  // Warm pinks, coral membranes, electrical impulse bursts.
  'neural': {
    id: 'neural',
    name: 'Neural',
    description: 'Living brain tissue under a microscope',
    swatch: '#f472b6',
    background: '#0a0406',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#080305',
      '--surface': 'rgba(18, 8, 12, 0.85)',
      '--surface-hover': 'rgba(26, 12, 18, 0.90)',
      '--border': 'rgba(244, 114, 182, 0.08)',
      '--border-bright': 'rgba(244, 114, 182, 0.18)',
      '--text': '#e8c8d8',
      '--text-bright': '#f8e0ec',
      '--text-dim': '#806068',
      '--accent': '#f472b6',
      '--accent-glow': 'rgba(244, 114, 182, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#f472b6',
      project: '#34d399',
      concept: '#e879f9',
      location: '#fb923c',
    },
    memories: {
      fact: '#e2d8e0',
      commitment: '#f87171',
      learning: '#86efac',
      observation: '#f9a8d4',
      preference: '#fde68a',
      pattern: '#c084fc',
    },
    pattern: { color: '#e879f9', emissive: '#a21caf' },
    links: {
      relationship: 'rgba(244, 114, 182, 0.50)',
      memoryEntity: 'rgba(244, 114, 182, 0.15)',
      highlight: 'rgba(252, 231, 243, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(244, 114, 182, 0.18)',
    },
    particles: { strong: '#fbcfe8', normal: '#f472b6' },
    bloom: { strength: 1.3, radius: 0.7, threshold: 0.12 },
    emissive: { entity: 0.40, memory: 0.05, pattern: 0.55 },
    atmosphere: {
      fogColor: '#100408',
      fogNear: 250, fogFar: 1000, fogDensity: 0.001,
      ambientColor: '#f472b6', ambientCount: 600,
      ambientSize: 0.12, ambientSpeed: 0.06,
    },
    noise: { vertexDisplacement: 0.08, vertexFrequency: 1.8, vertexSpeed: 0.25 },
  },

  // ─── 3. COSMOS ──────────────────────────────────────────
  // Deep space nebulae, gravitational lensing, star nurseries.
  // Rich indigo/violet palette with emerald accents.
  'cosmos': {
    id: 'cosmos',
    name: 'Cosmos',
    description: 'Nebula gas clouds and star clusters',
    swatch: '#818cf8',
    background: '#000008',
    defaultCamera: 'cinematic',
    css: {
      '--bg': '#050510',
      '--surface': 'rgba(8, 8, 20, 0.85)',
      '--surface-hover': 'rgba(12, 12, 30, 0.90)',
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
      relationship: 'rgba(130, 140, 248, 0.50)',
      memoryEntity: 'rgba(120, 140, 255, 0.15)',
      highlight: 'rgba(125, 211, 252, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(140, 150, 255, 0.18)',
    },
    particles: { strong: '#00ffaa', normal: '#818cf8' },
    bloom: { strength: 1.6, radius: 0.8, threshold: 0.10 },
    emissive: { entity: 0.38, memory: 0.04, pattern: 0.5 },
    atmosphere: {
      fogColor: '#000010',
      fogNear: 150, fogFar: 1500, fogDensity: 0.0006,
      ambientColor: '#818cf8', ambientCount: 500,
      ambientSize: 0.08, ambientSpeed: 0.04,
    },
    noise: { vertexDisplacement: 0.05, vertexFrequency: 2.2, vertexSpeed: 0.35 },
  },

  // ─── 4. AURORA ──────────────────────────────────────────
  // Northern lights rippling across an arctic sky.
  // Green/teal curtains with magenta and violet fringe.
  'aurora': {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern lights dancing across the arctic sky',
    swatch: '#34d399',
    background: '#020a08',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#010806',
      '--surface': 'rgba(4, 18, 14, 0.85)',
      '--surface-hover': 'rgba(6, 26, 20, 0.90)',
      '--border': 'rgba(52, 211, 153, 0.08)',
      '--border-bright': 'rgba(52, 211, 153, 0.18)',
      '--text': '#b8e8d8',
      '--text-bright': '#d4f8ec',
      '--text-dim': '#4a8070',
      '--accent': '#34d399',
      '--accent-glow': 'rgba(52, 211, 153, 0.2)',
    },
    entities: {
      person: '#a78bfa',
      organization: '#34d399',
      project: '#2dd4bf',
      concept: '#c084fc',
      location: '#fbbf24',
    },
    memories: {
      fact: '#d0f0e0',
      commitment: '#fb7185',
      learning: '#6ee7b7',
      observation: '#7dd3fc',
      preference: '#fde68a',
      pattern: '#a78bfa',
    },
    pattern: { color: '#a78bfa', emissive: '#6d28d9' },
    links: {
      relationship: 'rgba(52, 211, 153, 0.50)',
      memoryEntity: 'rgba(52, 211, 153, 0.15)',
      highlight: 'rgba(167, 243, 208, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(52, 211, 153, 0.18)',
    },
    particles: { strong: '#c084fc', normal: '#34d399' },
    bloom: { strength: 1.5, radius: 0.85, threshold: 0.08 },
    emissive: { entity: 0.42, memory: 0.05, pattern: 0.55 },
    atmosphere: {
      fogColor: '#020a08',
      fogNear: 200, fogFar: 2000, fogDensity: 0.0003,
      ambientColor: '#34d399', ambientCount: 500,
      ambientSize: 0.18, ambientSpeed: 0.05,
    },
    noise: { vertexDisplacement: 0.07, vertexFrequency: 1.6, vertexSpeed: 0.4 },
  },

  // ─── 5. VOLCANIC ────────────────────────────────────────
  // Magma rivers through obsidian rock, ember sparks rising.
  // Deep reds, ember oranges, glowing fissure yellows.
  'volcanic': {
    id: 'volcanic',
    name: 'Volcanic',
    description: 'Magma flows through obsidian caverns',
    swatch: '#ef4444',
    background: '#0a0200',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#080100',
      '--surface': 'rgba(18, 6, 2, 0.88)',
      '--surface-hover': 'rgba(28, 10, 4, 0.92)',
      '--border': 'rgba(239, 68, 68, 0.08)',
      '--border-bright': 'rgba(239, 68, 68, 0.18)',
      '--text': '#e8c8b8',
      '--text-bright': '#f8e0d0',
      '--text-dim': '#806050',
      '--accent': '#ef4444',
      '--accent-glow': 'rgba(239, 68, 68, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#ef4444',
      project: '#f97316',
      concept: '#fb923c',
      location: '#fcd34d',
    },
    memories: {
      fact: '#e8d0c0',
      commitment: '#ef4444',
      learning: '#f97316',
      observation: '#fbbf24',
      preference: '#fde68a',
      pattern: '#dc2626',
    },
    pattern: { color: '#f97316', emissive: '#c2410c' },
    links: {
      relationship: 'rgba(239, 68, 68, 0.55)',
      memoryEntity: 'rgba(239, 68, 68, 0.15)',
      highlight: 'rgba(252, 211, 77, 0.9)',
      historical: 'rgba(255, 255, 255, 0.05)',
      default: 'rgba(239, 68, 68, 0.20)',
    },
    particles: { strong: '#fbbf24', normal: '#ef4444' },
    bloom: { strength: 1.8, radius: 0.9, threshold: 0.08 },
    emissive: { entity: 0.45, memory: 0.06, pattern: 0.6 },
    atmosphere: {
      fogColor: '#0a0200',
      fogNear: 180, fogFar: 900, fogDensity: 0.001,
      ambientColor: '#ef4444', ambientCount: 350,
      ambientSize: 0.10, ambientSpeed: 0.12,
    },
    noise: { vertexDisplacement: 0.10, vertexFrequency: 1.5, vertexSpeed: 0.5 },
  },

  // ─── 6. SYNTHWAVE ───────────────────────────────────────
  // Retro-futuristic neon grid, chrome reflections, 80s vibes.
  // Hot pink, electric blue, chrome purple.
  'synthwave': {
    id: 'synthwave',
    name: 'Synthwave',
    description: 'Retro-futuristic neon grid, 80s vibes',
    swatch: '#e879f9',
    background: '#0a0010',
    defaultCamera: 'cinematic',
    css: {
      '--bg': '#080010',
      '--surface': 'rgba(14, 4, 22, 0.88)',
      '--surface-hover': 'rgba(22, 6, 34, 0.92)',
      '--border': 'rgba(232, 121, 249, 0.08)',
      '--border-bright': 'rgba(232, 121, 249, 0.18)',
      '--text': '#e0c0f0',
      '--text-bright': '#f0d8ff',
      '--text-dim': '#705880',
      '--accent': '#e879f9',
      '--accent-glow': 'rgba(232, 121, 249, 0.2)',
    },
    entities: {
      person: '#38bdf8',
      organization: '#e879f9',
      project: '#f472b6',
      concept: '#818cf8',
      location: '#22d3ee',
    },
    memories: {
      fact: '#d8c0f0',
      commitment: '#f472b6',
      learning: '#38bdf8',
      observation: '#c084fc',
      preference: '#e879f9',
      pattern: '#818cf8',
    },
    pattern: { color: '#818cf8', emissive: '#4f46e5' },
    links: {
      relationship: 'rgba(232, 121, 249, 0.55)',
      memoryEntity: 'rgba(232, 121, 249, 0.15)',
      highlight: 'rgba(56, 189, 248, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(232, 121, 249, 0.20)',
    },
    particles: { strong: '#38bdf8', normal: '#e879f9' },
    bloom: { strength: 2.0, radius: 0.9, threshold: 0.06 },
    emissive: { entity: 0.50, memory: 0.06, pattern: 0.6 },
    atmosphere: {
      fogColor: '#0a0018',
      fogNear: 200, fogFar: 1200, fogDensity: 0.0008,
      ambientColor: '#e879f9', ambientCount: 450,
      ambientSize: 0.08, ambientSpeed: 0.07,
    },
    noise: { vertexDisplacement: 0.04, vertexFrequency: 2.8, vertexSpeed: 0.4 },
  },

  // ─── 7. FROST ───────────────────────────────────────────
  // Ice crystals refracting pale light, frozen breath.
  // Pale blues, silver whites, crisp crystal edges.
  'frost': {
    id: 'frost',
    name: 'Frost',
    description: 'Ice crystals and frozen starlight',
    swatch: '#7dd3fc',
    background: '#020810',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#020610',
      '--surface': 'rgba(6, 14, 28, 0.85)',
      '--surface-hover': 'rgba(10, 20, 38, 0.90)',
      '--border': 'rgba(125, 211, 252, 0.08)',
      '--border-bright': 'rgba(125, 211, 252, 0.18)',
      '--text': '#c0d8f0',
      '--text-bright': '#e0f0ff',
      '--text-dim': '#506880',
      '--accent': '#7dd3fc',
      '--accent-glow': 'rgba(125, 211, 252, 0.2)',
    },
    entities: {
      person: '#e0f2fe',
      organization: '#7dd3fc',
      project: '#a5f3fc',
      concept: '#bae6fd',
      location: '#67e8f9',
    },
    memories: {
      fact: '#c8e0f0',
      commitment: '#f0abfc',
      learning: '#a5f3fc',
      observation: '#bae6fd',
      preference: '#e0f2fe',
      pattern: '#67e8f9',
    },
    pattern: { color: '#67e8f9', emissive: '#0891b2' },
    links: {
      relationship: 'rgba(125, 211, 252, 0.45)',
      memoryEntity: 'rgba(125, 211, 252, 0.12)',
      highlight: 'rgba(224, 242, 254, 0.9)',
      historical: 'rgba(255, 255, 255, 0.06)',
      default: 'rgba(125, 211, 252, 0.15)',
    },
    particles: { strong: '#e0f2fe', normal: '#7dd3fc' },
    bloom: { strength: 1.2, radius: 0.6, threshold: 0.14 },
    emissive: { entity: 0.35, memory: 0.04, pattern: 0.45 },
    atmosphere: {
      fogColor: '#020810',
      fogNear: 250, fogFar: 1600, fogDensity: 0.0005,
      ambientColor: '#bae6fd', ambientCount: 500,
      ambientSize: 0.06, ambientSpeed: 0.03,
    },
    noise: { vertexDisplacement: 0.03, vertexFrequency: 3.0, vertexSpeed: 0.15 },
  },

  // ─── 8. AMBER ───────────────────────────────────────────
  // Warm sunset glow, honey-gold, prehistoric resin.
  // Rich golds, burnt sienna, warm earth tones.
  'amber': {
    id: 'amber',
    name: 'Amber',
    description: 'Warm sunset glow preserved in golden resin',
    swatch: '#f59e0b',
    background: '#0a0600',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#080500',
      '--surface': 'rgba(18, 12, 2, 0.88)',
      '--surface-hover': 'rgba(26, 18, 4, 0.92)',
      '--border': 'rgba(245, 158, 11, 0.08)',
      '--border-bright': 'rgba(245, 158, 11, 0.18)',
      '--text': '#e8d8b8',
      '--text-bright': '#f8ecd0',
      '--text-dim': '#806840',
      '--accent': '#f59e0b',
      '--accent-glow': 'rgba(245, 158, 11, 0.2)',
    },
    entities: {
      person: '#fde68a',
      organization: '#f59e0b',
      project: '#d97706',
      concept: '#fbbf24',
      location: '#92400e',
    },
    memories: {
      fact: '#e0d0b0',
      commitment: '#f87171',
      learning: '#fde68a',
      observation: '#fbbf24',
      preference: '#f59e0b',
      pattern: '#d97706',
    },
    pattern: { color: '#d97706', emissive: '#92400e' },
    links: {
      relationship: 'rgba(245, 158, 11, 0.50)',
      memoryEntity: 'rgba(245, 158, 11, 0.15)',
      highlight: 'rgba(253, 230, 138, 0.9)',
      historical: 'rgba(255, 255, 255, 0.05)',
      default: 'rgba(245, 158, 11, 0.18)',
    },
    particles: { strong: '#fde68a', normal: '#f59e0b' },
    bloom: { strength: 1.3, radius: 0.7, threshold: 0.12 },
    emissive: { entity: 0.38, memory: 0.05, pattern: 0.5 },
    atmosphere: {
      fogColor: '#0a0600',
      fogNear: 200, fogFar: 1100, fogDensity: 0.0006,
      ambientColor: '#f59e0b', ambientCount: 350,
      ambientSize: 0.10, ambientSpeed: 0.05,
    },
    noise: { vertexDisplacement: 0.05, vertexFrequency: 2.0, vertexSpeed: 0.25 },
  },

  // ─── 9. RAINFOREST ──────────────────────────────────────
  // Dense tropical canopy, bioluminescent fungi, dewy mist.
  // Emerald greens, warm wood browns, bright life accents.
  'rainforest': {
    id: 'rainforest',
    name: 'Rainforest',
    description: 'Bioluminescent fungi in a tropical canopy',
    swatch: '#22c55e',
    background: '#020a02',
    defaultCamera: 'gentleDrift',
    css: {
      '--bg': '#010800',
      '--surface': 'rgba(4, 16, 6, 0.88)',
      '--surface-hover': 'rgba(8, 24, 10, 0.92)',
      '--border': 'rgba(34, 197, 94, 0.08)',
      '--border-bright': 'rgba(34, 197, 94, 0.18)',
      '--text': '#b8e0c0',
      '--text-bright': '#d0f0d8',
      '--text-dim': '#4a7050',
      '--accent': '#22c55e',
      '--accent-glow': 'rgba(34, 197, 94, 0.2)',
    },
    entities: {
      person: '#fbbf24',
      organization: '#22c55e',
      project: '#86efac',
      concept: '#a3e635',
      location: '#84cc16',
    },
    memories: {
      fact: '#c0e0c8',
      commitment: '#fb923c',
      learning: '#86efac',
      observation: '#a3e635',
      preference: '#fde68a',
      pattern: '#4ade80',
    },
    pattern: { color: '#4ade80', emissive: '#15803d' },
    links: {
      relationship: 'rgba(34, 197, 94, 0.50)',
      memoryEntity: 'rgba(34, 197, 94, 0.15)',
      highlight: 'rgba(134, 239, 172, 0.9)',
      historical: 'rgba(255, 255, 255, 0.05)',
      default: 'rgba(34, 197, 94, 0.18)',
    },
    particles: { strong: '#fbbf24', normal: '#22c55e' },
    bloom: { strength: 1.2, radius: 0.65, threshold: 0.12 },
    emissive: { entity: 0.36, memory: 0.04, pattern: 0.48 },
    atmosphere: {
      fogColor: '#020a02',
      fogNear: 150, fogFar: 800, fogDensity: 0.0012,
      ambientColor: '#22c55e', ambientCount: 600,
      ambientSize: 0.14, ambientSpeed: 0.04,
    },
    noise: { vertexDisplacement: 0.07, vertexFrequency: 1.8, vertexSpeed: 0.2 },
  },

  // ─── 10. MIDNIGHT ───────────────────────────────────────
  // Monochrome elegance. Pure black canvas, silver filigree.
  // Professional, minimal, the data speaks for itself.
  'midnight': {
    id: 'midnight',
    name: 'Midnight',
    description: 'Minimal, elegant, professional',
    swatch: '#8898a8',
    background: '#000000',
    defaultCamera: 'slowOrbit',
    css: {
      '--bg': '#000000',
      '--surface': 'rgba(10, 10, 12, 0.88)',
      '--surface-hover': 'rgba(18, 18, 22, 0.92)',
      '--border': 'rgba(136, 152, 168, 0.08)',
      '--border-bright': 'rgba(136, 152, 168, 0.18)',
      '--text': '#b8b8c0',
      '--text-bright': '#e0e0e4',
      '--text-dim': '#585860',
      '--accent': '#8898a8',
      '--accent-glow': 'rgba(136, 152, 168, 0.15)',
    },
    entities: {
      person: '#c8d6e5',       // moonlit steel blue
      organization: '#a8c4d4', // dusty teal
      project: '#b8d4c8',     // sage frost
      concept: '#c8b8d8',     // lavender mist
      location: '#d4c4b4',    // warm sandstone
    },
    memories: {
      fact: '#9098a0',         // cool slate
      commitment: '#c0a8a8',  // dusty rose
      learning: '#98b0a0',    // muted sage
      observation: '#a0a8b8', // steel blue
      preference: '#b8b0a8',  // warm taupe
      pattern: '#8890a0',     // blue-gray
    },
    pattern: { color: '#8890a0', emissive: '#484860' },
    links: {
      relationship: 'rgba(136, 152, 168, 0.45)',
      memoryEntity: 'rgba(136, 152, 168, 0.12)',
      highlight: 'rgba(244, 244, 245, 0.9)',
      historical: 'rgba(255, 255, 255, 0.05)',
      default: 'rgba(136, 152, 168, 0.15)',
    },
    particles: { strong: '#c8d6e5', normal: '#8890a0' },
    bloom: { strength: 1.0, radius: 0.5, threshold: 0.18 },
    emissive: { entity: 0.30, memory: 0.03, pattern: 0.40 },
    atmosphere: {
      fogColor: '#000000',
      fogNear: 300, fogFar: 900, fogDensity: 0.0005,
      ambientColor: '#a1a1aa', ambientCount: 300,
      ambientSize: 0.06, ambientSpeed: 0.03,
    },
    noise: { vertexDisplacement: 0.03, vertexFrequency: 2.5, vertexSpeed: 0.2 },
  },
};

// ── Public API ───────────────────────────────────────────

export function getThemes() { return THEMES; }
export function getTheme(id) { return THEMES[id] || THEMES['deep-ocean']; }
export function getActiveTheme() { return THEMES[activeThemeId] || THEMES['deep-ocean']; }
export function getActiveThemeId() { return activeThemeId; }

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
