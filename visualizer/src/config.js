export const CONFIG = {
  BACKEND_URL: 'http://localhost:3849',

  SCENE: {
    background: 0x080808,
    fov: 60,
    near: 0.1,
    far: 5000,
  },

  BLOOM: {
    threshold: 0.35,
    strength: 0.65,
    radius: 0.4,
  },

  LIGHTS: {
    ambient: { color: 0x111111, intensity: 0.5 },
    key: { color: 0xffffff, position: [150, 200, 100], intensity: 1.1 },
    fill: { color: 0x9090a0, position: [-200, -100, 200], intensity: 0.35 },
    // accent light removed — node colors read cleaner without a competing point light
  },

  CONTROLS: {
    dampingFactor: 0.05,
    autoRotateSpeed: 0.0003,
  },

  PARTICLES: {
    starCount: 8000,
    nebulaCount: 3000,
    starRange: 1000,
  },

  LOD: {
    memoryVisibleDistance: 150,
  },

  QUALITY: {
    LOW: { bloomStrength: 0.6, starCount: 3000, nebulaCount: 1000, tubeSegments: 4 },
    MEDIUM: { bloomStrength: 0.9, starCount: 5000, nebulaCount: 2000, tubeSegments: 6 },
    HIGH: { bloomStrength: 1.2, starCount: 8000, nebulaCount: 3000, tubeSegments: 8 },
    ULTRA: { bloomStrength: 1.6, starCount: 12000, nebulaCount: 5000, tubeSegments: 12 },
  },

  NODE_COLORS: {
    person: '#fbbf24',
    organization: '#60a5fa',
    project: '#34d399',
    concept: '#c084fc',
    location: '#fb923c',
  },

  MEMORY_COLORS: {
    fact: '#e2e8f0',
    commitment: '#f87171',
    learning: '#4ade80',
    observation: '#93c5fd',
    preference: '#fbbf24',
    pattern: '#a78bfa',
  },
};
