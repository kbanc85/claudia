/**
 * Claudia Brain Visualizer — Design Configuration
 *
 * Single source of truth for all visual parameters.
 * Edit here or use the live GUI panel (press H to toggle).
 *
 * The config object is reactive — changes are picked up by the render loop.
 */

export const config = {
  // ── Theme ──────────────────────────────────────────────────
  theme: 'monochromePro',

  // ── Colors ─────────────────────────────────────────────────
  background: '#09090b',

  entityColors: {
    person: '#ffce7a',
    organization: '#94c8ff',
    project: '#6bffe1',
    concept: '#ffffff',
    location: '#d494ff'
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
    historical: '#27272a',
    // Per-memory-type link colors (memory-entity links)
    memoryEntityByType: {
      fact: '#94a3b8',
      commitment: '#f87171',
      learning: '#4ade80',
      observation: '#93c5fd',
      preference: '#fbbf24',
      pattern: '#a78bfa'
    }
  },

  // ── Lighting ───────────────────────────────────────────────
  lighting: {
    ambient: { color: '#18181b', intensity: 1 },
    key: { color: '#f4f4f5', intensity: 0.8, position: [150, 250, 150] },
    fill: { color: '#a1a1aa', intensity: 0.3, position: [-200, -150, 200] },
    accent: { color: '#3b82f6', intensity: 0.2, position: [0, 100, -200] }
  },

  // ── Nodes ──────────────────────────────────────────────────
  nodes: {
    // Entity nodes
    emissiveIntensity: 0.35,
    shininess: 40,
    specularColor: '#222244',
    minOpacity: 0.6,

    // Glow sprites
    glowSize: 4.5,          // multiplier of node size
    glowIntensity: 0.25,
    innerGlowSize: 2.0,     // multiplier of node size
    innerGlowIntensity: 0.4,

    // Labels
    labelSize: 2.2,
    labelColor: 'rgba(255,255,255,0.7)',
    labelOffset: 5,         // distance above node

    // Memory nodes
    memoryEmissive: 0.2,
    memoryMaxOpacity: 0.65,

    // Pattern nodes
    patternColor: '#71717a',
    patternEmissive: '#3f3f46',
    patternEmissiveIntensity: 0.5,
    patternOpacity: 0.5
  },

  // ── Links ──────────────────────────────────────────────────
  links: {
    // Curved tubes (relationships)
    curvature: 0.09,              // base curvature
    curvatureStrength: 0.1,       // additional curvature per strength
    tubeRadius: 0.15,             // base radius for normal links
    highlightRadius: 1.3,         // multiplier for highlighted links
    tubularSegments: 20,
    radialSegments: 6,

    // Opacity
    opacity: 0.27,
    highlightOpacity: 0.65,
    historicalOpacity: 0.04,

    // Memory-entity lines
    memoryLineAlpha: 0.06,

    // Edge bundling
    bundling: {
      enabled: true,
      strength: 0.6,       // how aggressively edges attract (0=off, 1=max)
      radius: 60,           // max distance for edge attraction
      iterations: 4,        // bundling passes
      segments: 5,           // control points per edge
      endpointStiffness: 0.85  // how much endpoints resist bundling (0=free, 1=pinned)
    }
  },

  // ── Resolution ───────────────────────────────────────────────
  resolution: {
    scale: 0       // 0 = auto (devicePixelRatio capped at 2), 0.5/1/1.5/2 = manual
  },

  // ── Particles ──────────────────────────────────────────────
  particles: {
    speed: 0.002,
    speedVariance: 0.001,
    size: 2.5,
    opacity: 0.8,
    highlightCount: 6,
    forwardCount: 2,
    strongCount: 1,
    strongThreshold: 0.6
  },

  // ── Animations ─────────────────────────────────────────────
  animations: {
    breathing: {
      entityRate: 0.8,
      entityDepth: 0.04,
      entityImportanceRateBonus: 0.3,
      entityImportanceDepthBonus: 0.03,
      memoryRate: 1.5,
      memoryRateVariance: 0.3,
      memoryDepth: 0.02,
      patternRate: 1.2,
      patternDepth: 0.08,
      commitmentRate: 2.0,
      commitmentDepth: 0.06
    },
    rotation: {
      orgSpeed: 0.15,
      orgTilt: 0.1,
      projectSpeed: 0.2,
      projectTilt: 0.15,
      conceptSpeedX: 0.1,
      conceptSpeedY: 0.15,
      patternSpeedY: 0.3,
      patternSpeedX: 0.1,
      patternTilt: 0.2
    },
    emissive: {
      entityPulseMultiplier: 0.7,
      entityPulseBase: 0.25,
      entityPulseDepth: 0.12,
      memoryPulseBase: 0.15,
      memoryPulseDepth: 0.1
    },
    spawn: {
      duration: 1.5,
      emissiveBoost: 1.2
    },
    pulse: {
      duration: 2.5,
      scaleBoost: 0.4,
      emissiveBase: 0.3,
      emissiveBoost: 0.8
    },
    shimmer: {
      duration: 3.0,
      emissiveBase: 0.3,
      emissiveDepth: 0.3,
      frequency: 10
    }
  },

  // ── Bloom ──────────────────────────────────────────────────
  bloom: {
    strength: 0.4,
    radius: 2,
    threshold: 0.15
  },

  // ── Fog ────────────────────────────────────────────────────
  fog: {
    color: '#09090b',
    density: 0.0006
  },

  // ── Ambient Effects ────────────────────────────────────────
  ambientParticles: {
    count: 800,
    spread: 600,
    wrapDistance: 300,
    size: 1.0,
    baseOpacity: 0.12,
    opacityPulse: 0.04,
    opacityPulseSpeed: 0.5,
    color: '#27272a',
    velocityX: 0.05,
    velocityY: 0.03,
    velocityZ: 0.05,
    wobbleX: 0.01,
    wobbleY: 0.01,
    wobbleZ: 0.01,
    wobbleSpeedX: 0.3,
    wobbleSpeedY: 0.2,
    wobbleSpeedZ: 0.25
  },

  starfield: {
    count: 1500,
    minRadius: 600,
    maxRadius: 1000,
    size: 0.6,
    opacity: 0.3,
    brightnessMin: 0.3,
    brightnessMax: 0.5
  },

  nebula: {
    enabled: false,
    size: 1500,
    positionZ: -400,
    rotationSpeed: 0.01,
    colors: {
      core: 'rgba(20, 20, 22, 0.2)',
      mid1: 'rgba(15, 15, 17, 0.1)',
      mid2: 'rgba(10, 10, 12, 0.05)',
      edge: 'rgba(9, 9, 11, 0)'
    },
    spots: []
  },

  // ── Camera ─────────────────────────────────────────────────
  camera: {
    fov: 60,
    near: 0.1,
    far: 2000,
    initialPosition: [0, 80, 350],
    autoRotateSpeed: 0.3,
    idleTimeout: 8000,
    minDistance: 30,
    maxDistance: 1500,
    dampingFactor: 0.05,
    focusDistance: 120,
    focusDuration: 1200
  },

  // ── Force Simulation ───────────────────────────────────────
  simulation: {
    chargeEntity: -180,
    chargePattern: -100,
    chargeMemory: -15,
    chargeDistanceMax: 300,
    linkDistanceRelationship: 80,
    linkDistanceRelationshipVariance: 40,
    linkDistanceMemory: 18,
    linkStrengthRelationship: 0.3,
    linkStrengthMemory: 0.4,
    alphaDecay: 0.008,
    velocityDecay: 0.4,
    warmupTicks: 80
  },

  // ── Quality Presets ────────────────────────────────────────
  quality: {
    current: 'high',
    presets: {
      low: { bloom: false, bloomStrength: 0, particles: false, starfield: false, nebula: false },
      medium: { bloom: true, bloomStrength: 1.0, particles: true, starfield: true, nebula: true },
      high: { bloom: true, bloomStrength: 1.5, particles: true, starfield: true, nebula: true },
      ultra: { bloom: true, bloomStrength: 1.8, particles: true, starfield: true, nebula: true }
    }
  }
};

// ── Update callbacks ─────────────────────────────────────────
// Modules can register callbacks to be notified when config changes

const updateCallbacks = new Set();

export function onConfigUpdate(callback) {
  updateCallbacks.add(callback);
  return () => updateCallbacks.delete(callback);
}

export function notifyConfigUpdate(changedPath) {
  for (const cb of updateCallbacks) {
    try {
      cb(changedPath);
    } catch (e) {
      console.warn('Config update callback error:', e);
    }
  }
}

// ── Export / Import ──────────────────────────────────────────

export function exportConfig() {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'claudia-brain-config.json';
  a.click();
  URL.revokeObjectURL(url);
  console.log('Config exported');
}

export function importConfig(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        deepMerge(config, imported);
        notifyConfigUpdate('*');
        console.log('Config imported');
        resolve(config);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Deep merge helper
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

// ── Persistence ──────────────────────────────────────────────

export function saveToLocalStorage() {
  try {
    localStorage.setItem('claudia-brain-config', JSON.stringify(config));
    console.log('Config saved to localStorage');
  } catch (e) {
    console.warn('Could not save config:', e);
  }
}

export function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('claudia-brain-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      deepMerge(config, parsed);
      console.log('Config loaded from localStorage');
      return true;
    }
  } catch (e) {
    console.warn('Could not load config:', e);
  }
  return false;
}
