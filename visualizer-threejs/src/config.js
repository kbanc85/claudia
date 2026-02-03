/**
 * Claudia Brain Visualizer — Design Configuration
 *
 * Single source of truth for all visual parameters.
 * Edit here or use the live GUI panel (press H to toggle).
 *
 * The config object is reactive — changes are picked up by the render loop.
 */

export const config = {
  // ── Colors ─────────────────────────────────────────────────
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
    historical: '#ffffff'
  },

  // ── Lighting ───────────────────────────────────────────────
  lighting: {
    ambient: { color: '#1a1a3e', intensity: 0.8 },
    key: { color: '#6366f1', intensity: 1.0, position: [150, 250, 150] },
    fill: { color: '#0ea5e9', intensity: 0.5, position: [-200, -150, 200] },
    accent: { color: '#f59e0b', intensity: 0.3, position: [0, 100, -200] }
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
    patternColor: '#a78bfa',
    patternEmissive: '#7c3aed',
    patternEmissiveIntensity: 0.5,
    patternOpacity: 0.5
  },

  // ── Links ──────────────────────────────────────────────────
  links: {
    // Curved tubes (relationships)
    curvature: 0.15,              // base curvature
    curvatureStrength: 0.1,       // additional curvature per strength
    tubeRadius: 0.15,             // base radius for normal links
    highlightRadius: 1.5,         // multiplier for highlighted links
    tubularSegments: 20,
    radialSegments: 6,

    // Opacity
    opacity: 0.15,
    highlightOpacity: 0.7,
    historicalOpacity: 0.04,

    // Memory-entity lines
    memoryLineAlpha: 0.06
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
    strength: 1.5,
    radius: 0.8,
    threshold: 0.3
  },

  // ── Fog ────────────────────────────────────────────────────
  fog: {
    color: '#050510',
    density: 0.0008
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
    color: '#6366f1',
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
    opacity: 0.5,
    brightnessMin: 0.3,
    brightnessMax: 0.8
  },

  nebula: {
    size: 1500,
    positionZ: -400,
    rotationSpeed: 0.01,
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
    warmupTicks: 80,
    umapScale: 50
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
