/**
 * Claudia Brain v4 -- Settings + Filters
 *
 * 6-tab settings panel (Theme, Quality, Simulation, Visuals, Camera, Presets)
 * and sidebar type/memory filters.
 */

import { getActiveTheme, getActiveThemeId, setActiveTheme, getThemes, onThemeChange } from '../themes.js';
import {
  getSetting, setSetting,
  exportSettings, importSettings,
  savePreset, loadPreset, deletePreset, listPresets
} from '../settings.js';
import { getBloomPass, getRGBShiftPass, applyQualityPreset } from '../effects/bloom.js';
import { getCameraModes, getCameraMode, setCameraMode } from '../camera.js';
import { configureLinks } from '../graph/links.js';
import { filterNodes, resetFilter, setLinkVisibilityFilter, clearLinkVisibilityFilter, getGraphData } from '../data/store.js';

let getGraph = null;

const ALL_ENTITY_TYPES = ['person', 'organization', 'project', 'concept', 'location'];
const ALL_MEMORY_TYPES = ['fact', 'commitment', 'learning', 'observation', 'preference', 'pattern'];

const ENTITY_SHAPES = {
  person: 'circle',
  organization: 'square',
  project: 'diamond',
  concept: 'circle',
  location: 'ring'
};

let activeFilters = { entities: new Set(), memories: new Set() };

// ── Init ──────────────────────────────────────────────────

export function initControls(callbacks) {
  getGraph = callbacks?.getGraph || null;
  initFilters();
  initSettingsPanel();
}

// ── Filters ───────────────────────────────────────────────

function initFilters() {
  const entityFilters = document.getElementById('type-filters');
  const memoryFilters = document.getElementById('memory-filters');
  if (!entityFilters || !memoryFilters) return;

  for (const type of ALL_ENTITY_TYPES) activeFilters.entities.add(type);
  for (const type of ALL_MEMORY_TYPES) activeFilters.memories.add(type);

  const theme = getActiveTheme();

  for (const type of ALL_ENTITY_TYPES) {
    entityFilters.appendChild(createFilterItem(type, theme.entities[type], true, (checked) => {
      if (checked) activeFilters.entities.add(type);
      else activeFilters.entities.delete(type);
      applyFilters();
    }, ENTITY_SHAPES[type]));
  }

  for (const type of ALL_MEMORY_TYPES) {
    memoryFilters.appendChild(createFilterItem(type, theme.memories[type], true, (checked) => {
      if (checked) activeFilters.memories.add(type);
      else activeFilters.memories.delete(type);
      applyFilters();
    }));
  }

  // Update filter dot colors on theme change
  onThemeChange((newTheme) => {
    const allDots = document.querySelectorAll('.filter-dot');
    allDots.forEach(dot => {
      const type = dot.closest('.filter-item')?.querySelector('span:last-child')?.textContent;
      if (type) {
        const color = newTheme.entities[type] || newTheme.memories[type];
        if (color) {
          dot.style.color = color;
          const shape = dot.getAttribute('data-shape');
          if (shape !== 'ring') dot.style.background = color;
        }
      }
    });
  });
}

function createFilterItem(type, color, checked, onChange, shape) {
  const label = document.createElement('label');
  label.className = 'filter-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  const dot = document.createElement('span');
  dot.className = 'filter-dot';
  dot.style.color = color;
  if (shape && shape !== 'ring') dot.style.background = color;
  if (shape) dot.setAttribute('data-shape', shape);

  const text = document.createElement('span');
  text.textContent = type;

  label.appendChild(checkbox);
  label.appendChild(dot);
  label.appendChild(text);
  return label;
}

function applyFilters() {
  filterNodes(node => {
    if (node.nodeType === 'entity') return activeFilters.entities.has(node.entityType);
    if (node.nodeType === 'memory') return activeFilters.memories.has(node.memoryType);
    if (node.nodeType === 'pattern') return true;
    return true;
  });
}

// ── Settings panel ────────────────────────────────────────

function initSettingsPanel() {
  const btn = document.getElementById('settings-btn');
  const panel = document.getElementById('settings-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#settings-container')) {
      panel.classList.add('hidden');
    }
  });

  const tabs = [
    { id: 'theme', label: 'Theme', builder: buildThemeTab },
    { id: 'views', label: 'Views', builder: buildViewsTab },
    { id: 'perf', label: 'Quality', builder: buildPerformanceTab },
    { id: 'display', label: 'Display', builder: buildDisplayTab },
    { id: 'sim', label: 'Simulation', builder: buildSimulationTab },
    { id: 'vis', label: 'Visuals', builder: buildVisualsTab },
    { id: 'cam', label: 'Camera', builder: buildCameraTab },
    { id: 'presets', label: 'Presets', builder: buildPresetsTab },
  ];

  const tabBar = document.createElement('div');
  tabBar.className = 'sp-tabs';
  const contents = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];

    const tabBtn = document.createElement('button');
    tabBtn.className = 'sp-tab' + (i === 0 ? ' active' : '');
    tabBtn.textContent = tab.label;
    tabBtn.dataset.tab = tab.id;

    const content = document.createElement('div');
    content.className = 'sp-content' + (i === 0 ? ' active' : '');
    content.dataset.tab = tab.id;
    tab.builder(content);

    tabBtn.addEventListener('click', () => {
      tabBar.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.sp-content').forEach(c => c.classList.remove('active'));
      tabBtn.classList.add('active');
      content.classList.add('active');
    });

    tabBar.appendChild(tabBtn);
    contents.push(content);
  }

  panel.replaceChildren(tabBar, ...contents);
}

// ── Tab: Theme ────────────────────────────────────────────

function buildThemeTab(container) {
  const grid = document.createElement('div');
  grid.className = 'sp-theme-grid';

  const themes = getThemes();
  const currentId = getActiveThemeId();

  for (const [id, theme] of Object.entries(themes)) {
    const item = document.createElement('div');
    item.className = 'sp-theme-item' + (id === currentId ? ' active' : '');
    item.dataset.themeId = id;
    item.title = theme.description;

    const swatch = document.createElement('div');
    swatch.className = 'sp-theme-swatch';
    swatch.style.background = theme.swatch;
    swatch.style.color = theme.swatch;

    const name = document.createElement('div');
    name.className = 'sp-theme-name';
    name.textContent = theme.name;

    item.appendChild(swatch);
    item.appendChild(name);

    item.addEventListener('click', () => {
      grid.querySelectorAll('.sp-theme-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      setActiveTheme(id);
      setSetting('theme', id);
    });

    grid.appendChild(item);
  }

  container.appendChild(grid);

  // Theme description below the grid
  const desc = document.createElement('div');
  desc.className = 'sp-theme-desc';
  desc.textContent = themes[currentId]?.description || '';
  container.appendChild(desc);

  // Update description when theme changes
  onThemeChange((newTheme) => {
    desc.textContent = newTheme.description;
    grid.querySelectorAll('.sp-theme-item').forEach(el => {
      el.classList.toggle('active', el.dataset.themeId === newTheme.id);
    });
  });
}

// ── Tab: Views (Connection presets) ───────────────────────

let activeView = 'all';

function buildViewsTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Connection Views';
  container.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'sp-note';
  desc.textContent = 'Filter visible relationships by type to explore different aspects of your knowledge graph.';
  container.appendChild(desc);

  const views = [
    { id: 'all', label: 'All', icon: '\u25CE', desc: 'Show all connections' },
    { id: 'strong', label: 'Strong Bonds', icon: '\u26A1', desc: 'Strength > 0.6' },
    { id: 'people', label: 'People Map', icon: '\uD83D\uDC64', desc: 'Person connections only' },
    { id: 'projects', label: 'Projects', icon: '\u2B21', desc: 'Project connections only' },
    { id: 'concepts', label: 'Concepts', icon: '\u25C8', desc: 'Concept links only' },
  ];

  const grid = document.createElement('div');
  grid.className = 'sp-view-grid';

  for (const view of views) {
    const btn = document.createElement('button');
    btn.className = 'sp-view-btn' + (view.id === activeView ? ' active' : '');
    btn.dataset.viewId = view.id;
    btn.title = view.desc;

    const icon = document.createElement('span');
    icon.className = 'sp-view-icon';
    icon.textContent = view.icon;

    const label = document.createElement('span');
    label.className = 'sp-view-label';
    label.textContent = view.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    btn.addEventListener('click', () => {
      activeView = view.id;
      grid.querySelectorAll('.sp-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyViewPreset(view.id);
    });

    grid.appendChild(btn);
  }

  container.appendChild(grid);
}

function applyViewPreset(viewId) {
  const G = getGraph?.();

  switch (viewId) {
    case 'all':
      clearLinkVisibilityFilter();
      break;

    case 'strong':
      setLinkVisibilityFilter(link => {
        if (link.linkType !== 'relationship') return true;
        return (link.strength || 0) > 0.6;
      });
      break;

    case 'people': {
      // Get all person node IDs
      const data = getGraphData();
      const personIds = new Set(
        data.nodes.filter(n => n.entityType === 'person').map(n => n.id)
      );
      setLinkVisibilityFilter(link => {
        if (link.linkType !== 'relationship') return true;
        const sid = typeof link.source === 'object' ? link.source.id : link.source;
        const tid = typeof link.target === 'object' ? link.target.id : link.target;
        return personIds.has(sid) || personIds.has(tid);
      });
      break;
    }

    case 'projects': {
      const data = getGraphData();
      const projectIds = new Set(
        data.nodes.filter(n => n.entityType === 'project').map(n => n.id)
      );
      setLinkVisibilityFilter(link => {
        if (link.linkType !== 'relationship') return true;
        const sid = typeof link.source === 'object' ? link.source.id : link.source;
        const tid = typeof link.target === 'object' ? link.target.id : link.target;
        return projectIds.has(sid) || projectIds.has(tid);
      });
      break;
    }

    case 'concepts': {
      const data = getGraphData();
      const conceptIds = new Set(
        data.nodes.filter(n => n.entityType === 'concept').map(n => n.id)
      );
      setLinkVisibilityFilter(link => {
        if (link.linkType !== 'relationship') return true;
        const sid = typeof link.source === 'object' ? link.source.id : link.source;
        const tid = typeof link.target === 'object' ? link.target.id : link.target;
        return conceptIds.has(sid) || conceptIds.has(tid);
      });
      break;
    }
  }

  // Force link re-render
  if (G) configureLinks(G);
}

// ── Tab: Performance ──────────────────────────────────────

function buildPerformanceTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Quality Preset';
  container.appendChild(title);

  const qualities = [
    { value: 'low', label: 'Low', desc: 'Light bloom, no aberration' },
    { value: 'medium', label: 'Medium', desc: 'Standard bloom, subtle aberration' },
    { value: 'high', label: 'High', desc: 'Full effects' },
    { value: 'ultra', label: 'Ultra', desc: 'Maximum glow + aberration' },
  ];

  const radioGroup = document.createElement('div');
  radioGroup.className = 'sp-radio-group';
  const currentQuality = getSetting('performance.quality') || 'high';

  for (const q of qualities) {
    const item = document.createElement('label');
    item.className = 'sp-radio-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sp-quality';
    radio.value = q.value;
    radio.checked = q.value === currentQuality;

    const label = document.createElement('span');
    label.textContent = q.label;

    const desc = document.createElement('span');
    desc.className = 'sp-radio-desc';
    desc.textContent = q.desc;

    radio.addEventListener('change', () => {
      if (radio.checked) {
        setSetting('performance.quality', q.value);
        // Actually apply the quality preset to bloom + chromatic aberration
        applyQualityPreset(q.value, getActiveTheme());
      }
    });

    item.appendChild(radio);
    item.appendChild(label);
    item.appendChild(desc);
    radioGroup.appendChild(item);
  }

  container.appendChild(radioGroup);

  // Toggles
  const toggleTitle = document.createElement('div');
  toggleTitle.className = 'sp-section-title';
  toggleTitle.textContent = 'Options';
  container.appendChild(toggleTitle);

  container.appendChild(buildToggle('Node Labels', 'performance.nodeLabels', () => {
    const G = getGraph?.();
    if (G) G.nodeThreeObject(G.nodeThreeObject());
  }));

  container.appendChild(buildToggle('Show Memories', 'performance.memoriesVisible', () => {
    const G = getGraph?.();
    if (G) G.nodeThreeObject(G.nodeThreeObject());
  }));

  container.appendChild(buildToggle('Show Cooling Relationships', 'performance.showHistorical', () => {
    const G = getGraph?.();
    if (G) configureLinks(G);
  }));

  container.appendChild(buildSliderRow('Max Particles', 'performance.maxParticles', 0, 5, 1, (val) => {
    const G = getGraph?.();
    if (G) {
      G.linkDirectionalParticles(link => {
        if (link.linkType === 'relationship') return val;
        return 0;
      });
    }
  }));
}

// ── Tab: Display ─────────────────────────────────────────

function buildDisplayTab(container) {
  // Resolution / Pixel Ratio
  const resTitle = document.createElement('div');
  resTitle.className = 'sp-section-title';
  resTitle.textContent = 'Resolution';
  container.appendChild(resTitle);

  const nativeDPR = window.devicePixelRatio || 1;
  container.appendChild(buildSliderRow('Pixel Ratio', 'display.pixelRatio', 0.5, Math.min(nativeDPR, 2.0), 0.1, (val) => {
    const G = getGraph?.();
    if (G) {
      const renderer = G.renderer();
      if (renderer) renderer.setPixelRatio(val);
    }
  }, () => {
    const G = getGraph?.();
    return G?.renderer()?.getPixelRatio() || 1;
  }));

  const resNote = document.createElement('div');
  resNote.className = 'sp-note';
  resNote.textContent = `Native: ${nativeDPR.toFixed(1)}x. Lower = faster, higher = sharper.`;
  container.appendChild(resNote);

  // Fog
  const fogTitle = document.createElement('div');
  fogTitle.className = 'sp-section-title';
  fogTitle.textContent = 'Atmosphere';
  container.appendChild(fogTitle);

  container.appendChild(buildSliderRow('Fog Density', 'visuals.fogDensity', 0, 0.003, 0.0001, (val) => {
    const G = getGraph?.();
    if (G) {
      const scene = G.scene();
      if (scene?.fog) {
        // For exponential fog
        if (scene.fog.density !== undefined) scene.fog.density = val;
      }
    }
  }, () => {
    const G = getGraph?.();
    const scene = G?.scene();
    return scene?.fog?.density ?? 0.0005;
  }));

  container.appendChild(buildToggle('Ambient Particles', 'visuals.ambientParticles', () => {
    // Toggling requires rebuild -- just inform user
  }));

  container.appendChild(buildSliderRow('Ambient Speed', 'visuals.ambientSpeed', 0.01, 0.2, 0.01, () => {
    // Picked up by animation loop
  }, () => getSetting('visuals.ambientSpeed') ?? 0.06));

  // Background color override
  const bgTitle = document.createElement('div');
  bgTitle.className = 'sp-section-title';
  bgTitle.textContent = 'Background';
  container.appendChild(bgTitle);

  const bgColorRow = buildColorRow('Background', 'display.backgroundColor', (val) => {
    const G = getGraph?.();
    if (G) {
      const scene = G.scene();
      if (scene) scene.background = new (window.THREE?.Color || getThreeColor())(val);
    }
    document.documentElement.style.setProperty('--bg', val);
  });
  container.appendChild(bgColorRow);

  // Update background color picker when theme changes
  onThemeChange((newTheme) => {
    const colorInput = bgColorRow.querySelector('input[type="color"]');
    if (colorInput && !getSetting('display.backgroundColor')) {
      colorInput.value = newTheme.background || '#000000';
    }
  });

  // Opacity controls
  const uiTitle = document.createElement('div');
  uiTitle.className = 'sp-section-title';
  uiTitle.textContent = 'UI';
  container.appendChild(uiTitle);

  container.appendChild(buildSliderRow('Panel Opacity', 'display.panelOpacity', 0.3, 1.0, 0.05, (val) => {
    document.documentElement.style.setProperty('--surface-opacity', val.toString());
    // Update surfaces with new opacity
    const sidebar = document.getElementById('sidebar');
    const hud = document.getElementById('hud-bar');
    if (sidebar) sidebar.style.opacity = val;
    if (hud) hud.style.opacity = val;
  }, () => getSetting('display.panelOpacity') ?? 1.0));

  container.appendChild(buildToggle('Show Sidebar', 'display.showSidebar', (val) => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = val ? '' : 'none';
  }));

  container.appendChild(buildToggle('Show Timeline', 'display.showTimeline', (val) => {
    const timeline = document.getElementById('timeline-container');
    if (timeline) timeline.style.display = val ? '' : 'none';
  }));
}

/**
 * Build a color picker row for settings.
 */
function buildColorRow(label, settingPath, onChange) {
  const row = document.createElement('div');
  row.className = 'sp-color-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'color';
  input.value = getSetting(settingPath) || getActiveTheme().background || '#000000';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'sp-color-reset';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    const themeDefault = getActiveTheme().background || '#000000';
    input.value = themeDefault;
    setSetting(settingPath, null);
    onChange(themeDefault);
  });

  input.addEventListener('input', () => {
    setSetting(settingPath, input.value);
    onChange(input.value);
  });

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(resetBtn);
  return row;
}

// Helper to get Three.js Color (avoid direct import)
function getThreeColor() {
  return class { constructor(c) { this.set?.(c); } };
}

// ── Tab: Simulation ───────────────────────────────────────

function buildSimulationTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Force Parameters';
  container.appendChild(title);

  container.appendChild(buildSliderRow('Charge', 'simulation.chargeStrength', -500, 0, 1, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('charge')?.strength(val);
      G.d3ReheatSimulation();
    }
  }));

  container.appendChild(buildSliderRow('Link Distance', 'simulation.linkDistance', 10, 200, 1, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('link')?.distance(val);
      G.d3ReheatSimulation();
    }
  }));

  container.appendChild(buildSliderRow('Link Strength', 'simulation.linkStrength', 0, 1, 0.01, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('link')?.strength(val);
      G.d3ReheatSimulation();
    }
  }));

  container.appendChild(buildSliderRow('Velocity Decay', 'simulation.velocityDecay', 0.01, 0.9, 0.01, (val) => {
    const G = getGraph?.();
    if (G) G.d3VelocityDecay(val);
  }));

  container.appendChild(buildSliderRow('Alpha Decay', 'simulation.alphaDecay', 0.001, 0.05, 0.001, (val) => {
    const G = getGraph?.();
    if (G) G.d3AlphaDecay(val);
  }));

  const reheatBtn = document.createElement('button');
  reheatBtn.className = 'sp-btn';
  reheatBtn.textContent = '\u26A1 Reheat Simulation';
  reheatBtn.addEventListener('click', () => {
    const G = getGraph?.();
    if (G) G.d3ReheatSimulation();
  });
  container.appendChild(reheatBtn);
}

// ── Tab: Visuals ──────────────────────────────────────────

function buildVisualsTab(container) {
  const bloomTitle = document.createElement('div');
  bloomTitle.className = 'sp-section-title';
  bloomTitle.textContent = 'Bloom';
  container.appendChild(bloomTitle);

  container.appendChild(buildSliderRow('Strength', 'visuals.bloomStrength', 0, 5, 0.1, (val) => {
    const bp = getBloomPass();
    if (bp) bp.strength = val;
  }, () => getBloomPass()?.strength));

  container.appendChild(buildSliderRow('Radius', 'visuals.bloomRadius', 0, 2, 0.05, (val) => {
    const bp = getBloomPass();
    if (bp) bp.radius = val;
  }, () => getBloomPass()?.radius));

  container.appendChild(buildSliderRow('Threshold', 'visuals.bloomThreshold', 0, 1, 0.01, (val) => {
    const bp = getBloomPass();
    if (bp) bp.threshold = val;
  }, () => getBloomPass()?.threshold));

  container.appendChild(buildSliderRow('Chromatic Aberration', 'visuals.chromaticAberration', 0, 0.01, 0.0005, (val) => {
    const rgbPass = getRGBShiftPass();
    if (rgbPass) rgbPass.uniforms.amount.value = val;
  }, () => getRGBShiftPass()?.uniforms?.amount?.value));

  // Node sizing
  const nodeTitle = document.createElement('div');
  nodeTitle.className = 'sp-section-title';
  nodeTitle.textContent = 'Nodes';
  container.appendChild(nodeTitle);

  container.appendChild(buildSliderRow('Node Size', 'visuals.nodeScale', 0.3, 3.0, 0.1, (val) => {
    // Regenerate all node objects with new scale
    const G = getGraph?.();
    if (G) G.nodeThreeObject(G.nodeThreeObject());
  }));

  const linkTitle = document.createElement('div');
  linkTitle.className = 'sp-section-title';
  linkTitle.textContent = 'Links & Particles';
  container.appendChild(linkTitle);

  container.appendChild(buildSliderRow('Curvature', 'visuals.linkCurvature', 0, 0.6, 0.01, (val) => {
    const G = getGraph?.();
    if (G) G.linkCurvature(link => {
      if (link.linkType === 'relationship') return val;
      return val * 0.6;
    });
  }));

  container.appendChild(buildSliderRow('Particle Speed', 'visuals.particleSpeed', 0.001, 0.02, 0.001, (val) => {
    const G = getGraph?.();
    if (G) G.linkDirectionalParticleSpeed(val);
  }));

  container.appendChild(buildSliderRow('Particle Width', 'visuals.particleWidth', 0.5, 5, 0.1, (val) => {
    const G = getGraph?.();
    if (G) G.linkDirectionalParticleWidth(val);
  }));
}

// ── Tab: Camera ───────────────────────────────────────────

function buildCameraTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Animation Mode';
  container.appendChild(title);

  const modes = getCameraModes();
  const currentMode = getCameraMode();
  const radioGroup = document.createElement('div');
  radioGroup.className = 'sp-radio-group';

  for (const [id, mode] of Object.entries(modes)) {
    const item = document.createElement('label');
    item.className = 'sp-radio-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'sp-camera-mode';
    radio.value = id;
    radio.checked = id === currentMode;

    const label = document.createElement('span');
    label.textContent = mode.label;

    const desc = document.createElement('span');
    desc.className = 'sp-radio-desc';
    desc.textContent = mode.desc;

    radio.addEventListener('change', () => {
      if (radio.checked) {
        setCameraMode(id);
        setSetting('cameraMode', id);
      }
    });

    item.appendChild(radio);
    item.appendChild(label);
    item.appendChild(desc);
    radioGroup.appendChild(item);
  }

  container.appendChild(radioGroup);
}

// ── Tab: Presets ──────────────────────────────────────────

function buildPresetsTab(container) {
  const btnRow = document.createElement('div');
  btnRow.className = 'sp-btn-row';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'sp-btn';
  exportBtn.textContent = 'Export Settings';
  exportBtn.addEventListener('click', () => exportSettings());

  const importBtn = document.createElement('button');
  importBtn.className = 'sp-btn';
  importBtn.textContent = 'Import Settings';
  importBtn.addEventListener('click', () => {
    document.getElementById('settings-import-input')?.click();
  });

  btnRow.appendChild(exportBtn);
  btnRow.appendChild(importBtn);
  container.appendChild(btnRow);

  // Wire file input
  const fileInput = document.getElementById('settings-import-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (importSettings(reader.result)) {
          window.location.reload();
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  // Save preset
  const saveTitle = document.createElement('div');
  saveTitle.className = 'sp-section-title';
  saveTitle.textContent = 'Save Current As Preset';
  container.appendChild(saveTitle);

  const saveRow = document.createElement('div');
  saveRow.className = 'sp-preset-save';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Preset name...';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;
    savePreset(name);
    nameInput.value = '';
    renderPresetList(presetList);
  });

  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  container.appendChild(saveRow);

  // Preset list
  const listTitle = document.createElement('div');
  listTitle.className = 'sp-section-title';
  listTitle.textContent = 'Saved Presets';
  container.appendChild(listTitle);

  const presetList = document.createElement('div');
  presetList.className = 'sp-preset-list';
  container.appendChild(presetList);

  renderPresetList(presetList);
}

function renderPresetList(container) {
  container.replaceChildren();
  const presets = listPresets();

  if (presets.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sp-empty';
    empty.textContent = 'No saved presets';
    container.appendChild(empty);
    return;
  }

  for (const name of presets) {
    const item = document.createElement('div');
    item.className = 'sp-preset-item';

    const nameEl = document.createElement('span');
    nameEl.textContent = name;

    const actions = document.createElement('div');

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      if (loadPreset(name)) window.location.reload();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'sp-preset-delete';
    delBtn.textContent = '\u2715';
    delBtn.addEventListener('click', () => {
      deletePreset(name);
      renderPresetList(container);
    });

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    item.appendChild(nameEl);
    item.appendChild(actions);
    container.appendChild(item);
  }
}

// ── Utility builders ──────────────────────────────────────

function buildSliderRow(label, settingPath, min, max, step, onChange, getCurrentValue) {
  const row = document.createElement('div');
  row.className = 'sp-slider-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;

  let initial = getSetting(settingPath);
  if (initial == null && getCurrentValue) initial = getCurrentValue();
  if (initial == null) initial = (min + max) / 2;
  input.value = initial;

  const valDisplay = document.createElement('span');
  valDisplay.className = 'sp-slider-value';
  valDisplay.textContent = formatSliderValue(parseFloat(input.value));

  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    valDisplay.textContent = formatSliderValue(val);
    setSetting(settingPath, val);
    onChange(val);
  });

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(valDisplay);
  return row;
}

function formatSliderValue(val) {
  if (Math.abs(val) >= 10) return Math.round(val).toString();
  if (Math.abs(val) >= 1) return val.toFixed(1);
  if (Math.abs(val) >= 0.01) return val.toFixed(2);
  if (Math.abs(val) >= 0.001) return val.toFixed(4);
  return val.toFixed(4);
}

function buildToggle(label, settingPath, onChange) {
  const row = document.createElement('div');
  row.className = 'sp-toggle-row';

  const lbl = document.createElement('span');
  lbl.textContent = label;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = getSetting(settingPath) !== false;

  checkbox.addEventListener('change', () => {
    setSetting(settingPath, checkbox.checked);
    onChange(checkbox.checked);
  });

  row.appendChild(lbl);
  row.appendChild(checkbox);
  return row;
}
