/**
 * Claudia Brain Visualizer — Design Control Panel
 *
 * Real-time GUI for tweaking visual parameters using lil-gui.
 * Press H to toggle visibility.
 *
 * All changes are immediately applied to the scene.
 */

import GUI from 'lil-gui';
import {
  config,
  notifyConfigUpdate,
  exportConfig,
  importConfig,
  saveToLocalStorage,
  loadFromLocalStorage
} from './config.js';
import {
  themes,
  applyTheme,
  getThemeNames,
  saveThemePreference,
  getCurrentTheme
} from './themes.js';

let gui = null;
let visible = false;

/**
 * Initialize the design panel
 * @param {Function} onUpdate - Called whenever a config value changes
 * @returns {GUI} The lil-gui instance
 */
export function initDesignPanel(onUpdate) {
  // Load saved config first
  loadFromLocalStorage();

  gui = new GUI({ title: 'Design Controls', width: 320 });
  gui.domElement.style.zIndex = '1000';

  // Start hidden
  gui.hide();
  visible = false;

  // Wrap update to also notify subscribers
  const update = (path) => {
    notifyConfigUpdate(path);
    if (onUpdate) onUpdate(path);
  };

  // ── Theme ──────────────────────────────────────────────────
  const themeFolder = gui.addFolder('Theme');

  // Build theme options object { displayName: key }
  const themeOptions = {};
  for (const [key, theme] of Object.entries(themes)) {
    themeOptions[theme.name] = key;
  }

  // State holder for dropdown
  const themeState = { current: themes[getCurrentTheme()]?.name || 'Midnight' };

  themeFolder.add(themeState, 'current', Object.keys(themeOptions))
    .name('Style')
    .onChange((displayName) => {
      const themeKey = themeOptions[displayName];
      if (themeKey) {
        applyTheme(themeKey);
        saveThemePreference(themeKey);
        // Refresh all GUI controllers to show new values
        gui.controllersRecursive().forEach(c => c.updateDisplay());
        if (onUpdate) onUpdate('*');
      }
    });

  themeFolder.open();

  // ── Colors ─────────────────────────────────────────────────
  const colorsFolder = gui.addFolder('Colors');
  colorsFolder.addColor(config, 'background').name('Background').onChange(() => update('background'));

  const entityColorsFolder = colorsFolder.addFolder('Entity Colors');
  entityColorsFolder.addColor(config.entityColors, 'person').name('Person').onChange(() => update('entityColors.person'));
  entityColorsFolder.addColor(config.entityColors, 'organization').name('Organization').onChange(() => update('entityColors.organization'));
  entityColorsFolder.addColor(config.entityColors, 'project').name('Project').onChange(() => update('entityColors.project'));
  entityColorsFolder.addColor(config.entityColors, 'concept').name('Concept').onChange(() => update('entityColors.concept'));
  entityColorsFolder.addColor(config.entityColors, 'location').name('Location').onChange(() => update('entityColors.location'));
  entityColorsFolder.close();

  const memoryColorsFolder = colorsFolder.addFolder('Memory Colors');
  memoryColorsFolder.addColor(config.memoryColors, 'fact').name('Fact').onChange(() => update('memoryColors.fact'));
  memoryColorsFolder.addColor(config.memoryColors, 'commitment').name('Commitment').onChange(() => update('memoryColors.commitment'));
  memoryColorsFolder.addColor(config.memoryColors, 'learning').name('Learning').onChange(() => update('memoryColors.learning'));
  memoryColorsFolder.addColor(config.memoryColors, 'observation').name('Observation').onChange(() => update('memoryColors.observation'));
  memoryColorsFolder.addColor(config.memoryColors, 'preference').name('Preference').onChange(() => update('memoryColors.preference'));
  memoryColorsFolder.addColor(config.memoryColors, 'pattern').name('Pattern').onChange(() => update('memoryColors.pattern'));
  memoryColorsFolder.close();

  const linkColorsFolder = colorsFolder.addFolder('Link Colors');
  linkColorsFolder.addColor(config.linkColors, 'relationship').name('Relationship').onChange(() => update('linkColors.relationship'));
  linkColorsFolder.addColor(config.linkColors, 'highlighted').name('Highlighted').onChange(() => update('linkColors.highlighted'));
  linkColorsFolder.addColor(config.linkColors, 'particle').name('Particle').onChange(() => update('linkColors.particle'));
  linkColorsFolder.add(config.linkColors, 'memoryEntityAlpha', 0, 0.3).name('Memory Alpha').onChange(() => update('linkColors.memoryEntityAlpha'));
  linkColorsFolder.close();

  colorsFolder.close();

  // ── Bloom ──────────────────────────────────────────────────
  const bloomFolder = gui.addFolder('Bloom');
  bloomFolder.add(config.bloom, 'strength', 0, 3, 0.1).name('Strength').onChange(() => update('bloom.strength'));
  bloomFolder.add(config.bloom, 'radius', 0, 2, 0.1).name('Radius').onChange(() => update('bloom.radius'));
  bloomFolder.add(config.bloom, 'threshold', 0, 1, 0.05).name('Threshold').onChange(() => update('bloom.threshold'));
  bloomFolder.close();

  // ── Fog ────────────────────────────────────────────────────
  const fogFolder = gui.addFolder('Fog');
  fogFolder.addColor(config.fog, 'color').name('Color').onChange(() => update('fog.color'));
  fogFolder.add(config.fog, 'density', 0, 0.005, 0.0001).name('Density').onChange(() => update('fog.density'));
  fogFolder.close();

  // ── Nodes ──────────────────────────────────────────────────
  const nodesFolder = gui.addFolder('Nodes');
  nodesFolder.add(config.nodes, 'emissiveIntensity', 0, 1, 0.05).name('Emissive').onChange(() => update('nodes.emissiveIntensity'));
  nodesFolder.add(config.nodes, 'glowSize', 1, 10, 0.5).name('Glow Size').onChange(() => update('nodes.glowSize'));
  nodesFolder.add(config.nodes, 'glowIntensity', 0, 1, 0.05).name('Glow Intensity').onChange(() => update('nodes.glowIntensity'));
  nodesFolder.add(config.nodes, 'innerGlowSize', 0.5, 5, 0.25).name('Inner Glow Size').onChange(() => update('nodes.innerGlowSize'));
  nodesFolder.add(config.nodes, 'labelSize', 0.5, 5, 0.1).name('Label Size').onChange(() => update('nodes.labelSize'));
  nodesFolder.add(config.nodes, 'labelOffset', 0, 20, 1).name('Label Offset').onChange(() => update('nodes.labelOffset'));
  nodesFolder.close();

  // ── Links ──────────────────────────────────────────────────
  const linksFolder = gui.addFolder('Links');
  linksFolder.add(config.links, 'curvature', 0, 0.5, 0.01).name('Curvature').onChange(() => update('links.curvature'));
  linksFolder.add(config.links, 'tubeRadius', 0.05, 0.5, 0.01).name('Tube Radius').onChange(() => update('links.tubeRadius'));
  linksFolder.add(config.links, 'highlightRadius', 1, 3, 0.1).name('Highlight Multiplier').onChange(() => update('links.highlightRadius'));
  linksFolder.add(config.links, 'opacity', 0, 0.5, 0.01).name('Opacity').onChange(() => update('links.opacity'));
  linksFolder.add(config.links, 'highlightOpacity', 0.3, 1, 0.05).name('Highlight Opacity').onChange(() => update('links.highlightOpacity'));
  linksFolder.close();

  // ── Particles ──────────────────────────────────────────────
  const particlesFolder = gui.addFolder('Link Particles');
  particlesFolder.add(config.particles, 'speed', 0.0005, 0.01, 0.0005).name('Speed').onChange(() => update('particles.speed'));
  particlesFolder.add(config.particles, 'size', 0.5, 5, 0.25).name('Size').onChange(() => update('particles.size'));
  particlesFolder.add(config.particles, 'opacity', 0.2, 1, 0.05).name('Opacity').onChange(() => update('particles.opacity'));
  particlesFolder.add(config.particles, 'highlightCount', 0, 12, 1).name('Highlight Count').onChange(() => update('particles.highlightCount'));
  particlesFolder.close();

  // ── Animations ─────────────────────────────────────────────
  const animFolder = gui.addFolder('Animations');

  const breathingFolder = animFolder.addFolder('Breathing');
  // Entity breathing
  breathingFolder.add(config.animations.breathing, 'entityRate', 0.2, 2, 0.1).name('Entity Rate').onChange(() => update('animations.breathing.entityRate'));
  breathingFolder.add(config.animations.breathing, 'entityDepth', 0, 0.15, 0.01).name('Entity Depth').onChange(() => update('animations.breathing.entityDepth'));
  breathingFolder.add(config.animations.breathing, 'entityImportanceRateBonus', 0, 1, 0.05).name('Entity Imp Rate+').onChange(() => update('animations.breathing.entityImportanceRateBonus'));
  breathingFolder.add(config.animations.breathing, 'entityImportanceDepthBonus', 0, 0.1, 0.005).name('Entity Imp Depth+').onChange(() => update('animations.breathing.entityImportanceDepthBonus'));
  // Memory breathing
  breathingFolder.add(config.animations.breathing, 'memoryRate', 0.5, 3, 0.1).name('Memory Rate').onChange(() => update('animations.breathing.memoryRate'));
  breathingFolder.add(config.animations.breathing, 'memoryDepth', 0, 0.1, 0.005).name('Memory Depth').onChange(() => update('animations.breathing.memoryDepth'));
  breathingFolder.add(config.animations.breathing, 'memoryRateVariance', 0, 1, 0.05).name('Memory Rate Var').onChange(() => update('animations.breathing.memoryRateVariance'));
  // Pattern breathing
  breathingFolder.add(config.animations.breathing, 'patternRate', 0.5, 3, 0.1).name('Pattern Rate').onChange(() => update('animations.breathing.patternRate'));
  breathingFolder.add(config.animations.breathing, 'patternDepth', 0, 0.15, 0.01).name('Pattern Depth').onChange(() => update('animations.breathing.patternDepth'));
  // Commitment breathing
  breathingFolder.add(config.animations.breathing, 'commitmentRate', 0.5, 4, 0.1).name('Commitment Rate').onChange(() => update('animations.breathing.commitmentRate'));
  breathingFolder.add(config.animations.breathing, 'commitmentDepth', 0, 0.15, 0.01).name('Commitment Depth').onChange(() => update('animations.breathing.commitmentDepth'));
  breathingFolder.close();

  const rotationFolder = animFolder.addFolder('Rotation');
  rotationFolder.add(config.animations.rotation, 'orgSpeed', 0, 0.5, 0.01).name('Organization').onChange(() => update('animations.rotation.orgSpeed'));
  rotationFolder.add(config.animations.rotation, 'projectSpeed', 0, 0.5, 0.01).name('Project').onChange(() => update('animations.rotation.projectSpeed'));
  rotationFolder.add(config.animations.rotation, 'patternSpeedY', 0, 0.5, 0.01).name('Pattern').onChange(() => update('animations.rotation.patternSpeedY'));
  rotationFolder.close();

  const effectsFolder = animFolder.addFolder('Effects');
  effectsFolder.add(config.animations.spawn, 'duration', 0.5, 3, 0.1).name('Spawn Duration').onChange(() => update('animations.spawn.duration'));
  effectsFolder.add(config.animations.pulse, 'duration', 0.5, 5, 0.25).name('Pulse Duration').onChange(() => update('animations.pulse.duration'));
  effectsFolder.add(config.animations.shimmer, 'duration', 1, 5, 0.25).name('Shimmer Duration').onChange(() => update('animations.shimmer.duration'));
  effectsFolder.close();

  animFolder.close();

  // ── Ambient Effects ────────────────────────────────────────
  const ambientFolder = gui.addFolder('Ambient Effects');

  const dustFolder = ambientFolder.addFolder('Neural Dust');
  dustFolder.add(config.ambientParticles, 'count', 0, 2000, 100).name('Count (reload)').onChange(() => update('ambientParticles.count'));
  dustFolder.add(config.ambientParticles, 'size', 0.2, 3, 0.1).name('Size').onChange(() => update('ambientParticles.size'));
  dustFolder.add(config.ambientParticles, 'baseOpacity', 0, 0.4, 0.01).name('Opacity').onChange(() => update('ambientParticles.baseOpacity'));
  dustFolder.addColor(config.ambientParticles, 'color').name('Color').onChange(() => update('ambientParticles.color'));
  dustFolder.close();

  const starfieldFolder = ambientFolder.addFolder('Starfield');
  starfieldFolder.add(config.starfield, 'count', 0, 3000, 100).name('Count (reload)').onChange(() => update('starfield.count'));
  starfieldFolder.add(config.starfield, 'size', 0.2, 2, 0.1).name('Size').onChange(() => update('starfield.size'));
  starfieldFolder.add(config.starfield, 'opacity', 0, 1, 0.05).name('Opacity').onChange(() => update('starfield.opacity'));
  starfieldFolder.close();

  const nebulaFolder = ambientFolder.addFolder('Nebula');
  nebulaFolder.add(config.nebula, 'size', 500, 3000, 100).name('Size').onChange(() => update('nebula.size'));
  nebulaFolder.add(config.nebula, 'rotationSpeed', 0, 0.05, 0.001).name('Rotation Speed').onChange(() => update('nebula.rotationSpeed'));
  nebulaFolder.close();

  ambientFolder.close();

  // ── Camera ─────────────────────────────────────────────────
  const cameraFolder = gui.addFolder('Camera');
  cameraFolder.add(config.camera, 'fov', 30, 90, 1).name('FOV').onChange(() => update('camera.fov'));
  cameraFolder.add(config.camera, 'autoRotateSpeed', 0, 1, 0.05).name('Auto-Rotate Speed').onChange(() => update('camera.autoRotateSpeed'));
  cameraFolder.add(config.camera, 'idleTimeout', 2000, 20000, 1000).name('Idle Timeout (ms)').onChange(() => update('camera.idleTimeout'));
  cameraFolder.add(config.camera, 'focusDistance', 50, 300, 10).name('Focus Distance').onChange(() => update('camera.focusDistance'));
  cameraFolder.add(config.camera, 'focusDuration', 500, 3000, 100).name('Focus Duration (ms)').onChange(() => update('camera.focusDuration'));
  cameraFolder.close();

  // ── Simulation ─────────────────────────────────────────────
  const simFolder = gui.addFolder('Force Simulation');
  simFolder.add(config.simulation, 'chargeEntity', -500, 0, 10).name('Entity Charge').onChange(() => update('simulation.chargeEntity'));
  simFolder.add(config.simulation, 'chargePattern', -300, 0, 10).name('Pattern Charge').onChange(() => update('simulation.chargePattern'));
  simFolder.add(config.simulation, 'chargeMemory', -100, 0, 5).name('Memory Charge').onChange(() => update('simulation.chargeMemory'));
  simFolder.add(config.simulation, 'linkDistanceRelationship', 20, 200, 5).name('Relationship Distance').onChange(() => update('simulation.linkDistanceRelationship'));
  simFolder.add(config.simulation, 'linkDistanceMemory', 5, 50, 1).name('Memory Distance').onChange(() => update('simulation.linkDistanceMemory'));
  simFolder.add(config.simulation, 'alphaDecay', 0.001, 0.05, 0.001).name('Alpha Decay').onChange(() => update('simulation.alphaDecay'));
  simFolder.add(config.simulation, 'velocityDecay', 0.1, 0.8, 0.05).name('Velocity Decay').onChange(() => update('simulation.velocityDecay'));
  simFolder.close();

  // ── Quality Preset ─────────────────────────────────────────
  const qualityFolder = gui.addFolder('Quality');
  qualityFolder.add(config.quality, 'current', ['low', 'medium', 'high', 'ultra'])
    .name('Preset')
    .onChange(() => update('quality.current'));
  qualityFolder.close();

  // ── Actions ────────────────────────────────────────────────
  const actionsFolder = gui.addFolder('Actions');

  actionsFolder.add({
    exportConfig: () => exportConfig()
  }, 'exportConfig').name('Export Config');

  actionsFolder.add({
    importConfig: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          await importConfig(file);
          // Refresh GUI to show new values
          gui.controllersRecursive().forEach(c => c.updateDisplay());
          update('*');
        }
      };
      input.click();
    }
  }, 'importConfig').name('Import Config');

  actionsFolder.add({
    save: () => saveToLocalStorage()
  }, 'save').name('Save to Browser');

  actionsFolder.add({
    reset: () => {
      localStorage.removeItem('claudia-brain-config');
      window.location.reload();
    }
  }, 'reset').name('Reset to Defaults');

  actionsFolder.open();

  // ── Keyboard toggle ────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Don't toggle if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      togglePanel();
    }
  });

  console.log('Design panel initialized (press H to toggle)');
  return gui;
}

/**
 * Toggle panel visibility
 */
export function togglePanel() {
  if (!gui) return;

  visible = !visible;
  if (visible) {
    gui.show();
  } else {
    gui.hide();
  }
}

/**
 * Show the panel
 */
export function showPanel() {
  if (gui && !visible) {
    visible = true;
    gui.show();
  }
}

/**
 * Hide the panel
 */
export function hidePanel() {
  if (gui && visible) {
    visible = false;
    gui.hide();
  }
}

/**
 * Check if panel is visible
 */
export function isPanelVisible() {
  return visible;
}

/**
 * Get the GUI instance
 */
export function getGUI() {
  return gui;
}

/**
 * Destroy the panel
 */
export function destroyPanel() {
  if (gui) {
    gui.destroy();
    gui = null;
    visible = false;
  }
}
