/**
 * Claudia Brain -- UI overlays
 * Search, type filters, detail panel, timeline scrubber, stats HUD,
 * and the unified settings panel (6 tabs inside the gear icon).
 */

import { getActiveTheme, getActiveThemeId, setActiveTheme, getThemes, onThemeChange } from './themes.js';
import {
  getSetting, setSetting, saveSettings,
  exportSettings, importSettings,
  savePreset, loadPreset, deletePreset, listPresets
} from './settings.js';
import { applyQuality, getBloomPass } from './effects.js';
import { getCameraModes, getCameraMode, setCameraMode } from './camera.js';
import { configureLinks } from './links.js';

let graphData = null;
let activeFilters = { entities: new Set(), memories: new Set() };
let allEntityTypes = ['person', 'organization', 'project', 'concept', 'location'];
let allMemoryTypes = ['fact', 'commitment', 'learning', 'observation', 'preference', 'pattern'];
let timelineEvents = [];
let timelineRange = { start: null, end: null };

// Callbacks set by main.js
let onFocusNode = null;
let onFilterNodes = null;
let onResetFilter = null;
let getGraph = null;

export function initUI(data, callbacks) {
  graphData = data;
  onFocusNode = callbacks.focusNode;
  onFilterNodes = callbacks.filterNodes;
  onResetFilter = callbacks.resetFilter;
  getGraph = callbacks.getGraph || null;

  initSearch();
  initFilters();
  initDetailPanel();
  initTimeline();
  initSettingsPanel();
}

export function setUIGraphData(data) {
  graphData = data;
}

// ── Search ──────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim().toLowerCase();
      if (query.length < 2) {
        results.classList.remove('active');
        return;
      }
      performSearch(query);
    }, 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      results.classList.remove('active');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      results.classList.remove('active');
    }
  });
}

function performSearch(query) {
  const results = document.getElementById('search-results');
  results.replaceChildren();

  const matches = graphData.nodes
    .filter(n => {
      const name = (n.name || '').toLowerCase();
      const content = (n.content || '').toLowerCase();
      const desc = (n.description || '').toLowerCase();
      return name.includes(query) || content.includes(query) || desc.includes(query);
    })
    .sort((a, b) => (b.importance || 0) - (a.importance || 0))
    .slice(0, 20);

  if (matches.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'search-result';
    noResult.textContent = 'No matches found';
    noResult.style.color = 'var(--text-dim)';
    results.appendChild(noResult);
    results.classList.add('active');
    return;
  }

  for (const node of matches) {
    const div = document.createElement('div');
    div.className = 'search-result';

    const typeBadge = document.createElement('span');
    typeBadge.className = 'result-type';
    typeBadge.style.color = node.color;
    typeBadge.textContent = node.entityType || node.memoryType || node.nodeType;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = node.name;

    div.appendChild(typeBadge);
    div.appendChild(nameSpan);

    div.addEventListener('click', () => {
      if (onFocusNode) onFocusNode(node);
      results.classList.remove('active');
      document.getElementById('search-input').value = node.name;

      if (node.nodeType === 'entity') {
        fetch(`/api/entity/${node.dbId}`)
          .then(r => r.json())
          .then(detail => showDetail(node, detail));
      } else {
        showDetail(node, null);
      }
    });

    results.appendChild(div);
  }

  results.classList.add('active');
}

// ── Filters ─────────────────────────────────────────────

const ENTITY_SHAPES = {
  person: 'circle',
  organization: 'square',
  project: 'diamond',
  concept: 'circle',
  location: 'ring'
};

function initFilters() {
  const entityFilters = document.getElementById('type-filters');
  const memoryFilters = document.getElementById('memory-filters');

  for (const type of allEntityTypes) activeFilters.entities.add(type);
  for (const type of allMemoryTypes) activeFilters.memories.add(type);

  // Use theme colors for filter dots
  const theme = getActiveTheme();

  for (const type of allEntityTypes) {
    entityFilters.appendChild(createFilterItem(type, theme.entities[type], true, (checked) => {
      if (checked) activeFilters.entities.add(type);
      else activeFilters.entities.delete(type);
      applyFilters();
    }, ENTITY_SHAPES[type]));
  }

  for (const type of allMemoryTypes) {
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
  if (onFilterNodes) {
    onFilterNodes(node => {
      if (node.nodeType === 'entity') return activeFilters.entities.has(node.entityType);
      if (node.nodeType === 'memory') return activeFilters.memories.has(node.memoryType);
      if (node.nodeType === 'pattern') return true;
      return true;
    });
  }
}

// ── Detail panel ────────────────────────────────────────

function initDetailPanel() {
  const closeBtn = document.getElementById('detail-close');
  closeBtn.addEventListener('click', () => {
    document.getElementById('detail-panel').classList.add('hidden');
  });
}

export function showDetail(node, apiDetail) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  content.replaceChildren();
  panel.classList.remove('hidden');

  // Header
  const header = document.createElement('div');
  header.className = 'detail-header';

  const h2 = document.createElement('h2');
  h2.textContent = node.name;
  h2.style.color = node.color;

  const typeLabel = document.createElement('div');
  typeLabel.className = 'detail-type';
  typeLabel.textContent = node.entityType || node.memoryType || node.nodeType;

  header.appendChild(h2);
  header.appendChild(typeLabel);
  content.appendChild(header);

  // Description
  if (node.description || node.content) {
    const descSection = createSection('Description');
    const descText = document.createElement('div');
    descText.className = 'detail-item';
    descText.textContent = node.description || node.content;
    descSection.appendChild(descText);
    content.appendChild(descSection);
  }

  // Stats
  const statsSection = createSection('Properties');
  if (node.importance !== undefined) {
    statsSection.appendChild(createStatItem('Importance', node.importance.toFixed(2), node.importance));
  }
  if (node.confidence !== undefined) {
    statsSection.appendChild(createStatItem('Confidence', node.confidence.toFixed(2), node.confidence));
  }
  if (node.accessCount !== undefined) {
    statsSection.appendChild(createStatItem('Recalls', String(node.accessCount)));
  }
  if (node.verificationStatus) {
    statsSection.appendChild(createStatItem('Status', node.verificationStatus));
  }
  if (node.createdAt) {
    statsSection.appendChild(createStatItem('Created', formatDate(node.createdAt)));
  }
  if (node.llmImproved) {
    statsSection.appendChild(createStatItem('Refined', 'LLM-improved'));
  }
  content.appendChild(statsSection);

  // API detail
  if (apiDetail) {
    if (apiDetail.relationships?.length > 0) {
      const relSection = createSection(`Relationships (${apiDetail.relationships.length})`);
      for (const rel of apiDetail.relationships) {
        const item = document.createElement('div');
        item.className = 'detail-item';

        const name = document.createElement('strong');
        name.textContent = rel.other_name;

        const type = document.createElement('span');
        type.textContent = ` ${rel.relationship_type}`;
        type.style.color = 'var(--text-dim)';

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        meta.textContent = `strength: ${rel.strength?.toFixed(2)} | ${rel.direction}`;

        item.appendChild(name);
        item.appendChild(type);
        item.appendChild(meta);

        item.addEventListener('click', () => {
          const targetNode = graphData?.nodes.find(n => n.id === `entity-${rel.other_id}`);
          if (targetNode && onFocusNode) onFocusNode(targetNode);
        });

        relSection.appendChild(item);
      }
      content.appendChild(relSection);
    }

    if (apiDetail.memories?.length > 0) {
      const memSection = createSection(`Memories (${apiDetail.memories.length})`);
      for (const mem of apiDetail.memories.slice(0, 15)) {
        const item = document.createElement('div');
        item.className = 'detail-item';

        const text = document.createElement('div');
        text.textContent = mem.content;

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        const parts = [mem.type];
        if (mem.importance) parts.push(`imp: ${mem.importance.toFixed(2)}`);
        if (mem.relationship) parts.push(mem.relationship);
        meta.textContent = parts.join(' | ');

        item.appendChild(text);
        item.appendChild(meta);

        item.addEventListener('click', () => {
          const memNode = graphData?.nodes.find(n => n.id === `memory-${mem.id}`);
          if (memNode && onFocusNode) onFocusNode(memNode);
        });

        memSection.appendChild(item);
      }
      content.appendChild(memSection);
    }

    if (apiDetail.documents?.length > 0) {
      const docSection = createSection(`Documents (${apiDetail.documents.length})`);
      for (const doc of apiDetail.documents) {
        const item = document.createElement('div');
        item.className = 'detail-item';

        const name = document.createElement('div');
        name.textContent = doc.filename;

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        const parts = [doc.source_type || 'file', doc.relationship];
        if (doc.storage_path) parts.push(doc.storage_path);
        meta.textContent = parts.join(' | ');

        item.appendChild(name);
        item.appendChild(meta);
        docSection.appendChild(item);
      }
      content.appendChild(docSection);
    }

    if (apiDetail.aliases?.length > 0) {
      const aliasSection = createSection('Also known as');
      const text = document.createElement('div');
      text.className = 'detail-item';
      text.textContent = apiDetail.aliases.map(a => a.alias).join(', ');
      aliasSection.appendChild(text);
      content.appendChild(aliasSection);
    }
  }
}

function createSection(title) {
  const section = document.createElement('div');
  section.className = 'detail-section';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  section.appendChild(h3);
  return section;
}

function createStatItem(label, value, barValue) {
  const item = document.createElement('div');
  item.className = 'detail-item';
  const text = document.createElement('span');
  text.textContent = `${label}: ${value}`;
  item.appendChild(text);

  if (barValue !== undefined && typeof barValue === 'number') {
    const bar = document.createElement('span');
    bar.className = 'importance-bar';
    bar.style.width = `${Math.round(barValue * 60)}px`;
    item.appendChild(bar);
  }

  return item;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Settings panel (6 tabs) ─────────────────────────────

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

  // Build tabs
  const tabs = [
    { id: 'theme', label: 'Theme', builder: buildThemeTab },
    { id: 'perf', label: 'Quality', builder: buildPerformanceTab },
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

// ── Tab: Theme ──────────────────────────────────────────

function buildThemeTab(container) {
  const grid = document.createElement('div');
  grid.className = 'sp-theme-grid';

  const themes = getThemes();
  const currentId = getActiveThemeId();

  for (const [id, theme] of Object.entries(themes)) {
    const item = document.createElement('div');
    item.className = 'sp-theme-item' + (id === currentId ? ' active' : '');
    item.dataset.themeId = id;

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
}

// ── Tab: Performance ────────────────────────────────────

function buildPerformanceTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Quality Preset';
  container.appendChild(title);

  const qualities = [
    { value: 'low', label: 'Low', desc: 'No bloom' },
    { value: 'medium', label: 'Medium', desc: 'Subtle glow' },
    { value: 'high', label: 'High', desc: 'Theme defaults' },
    { value: 'ultra', label: 'Ultra', desc: 'Max glow' },
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
        applyQuality(q.value);
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

  container.appendChild(buildToggle('Antialiasing', 'performance.antialias', () => {
    // Antialias requires renderer recreation -- inform user
  }));

  container.appendChild(buildToggle('Node Labels', 'performance.nodeLabels', () => {
    // Force re-render all nodes to show/hide labels
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

// ── Tab: Simulation ─────────────────────────────────────

function buildSimulationTab(container) {
  const title = document.createElement('div');
  title.className = 'sp-section-title';
  title.textContent = 'Force Parameters';
  container.appendChild(title);

  container.appendChild(buildSliderRow('Charge', 'simulation.chargeStrength', -500, 0, 1, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('charge').strength(node => {
        if (node.nodeType === 'entity') return val;
        if (node.nodeType === 'pattern') return val * 0.55;
        return val * 0.08;
      });
      G.d3ReheatSimulation();
    }
  }));

  container.appendChild(buildSliderRow('Link Distance', 'simulation.linkDistance', 10, 200, 1, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('link').distance(link => {
        if (link.linkType === 'relationship') return val + (1 - (link.strength || 0.5)) * 40;
        return val * 0.22;
      });
      G.d3ReheatSimulation();
    }
  }));

  container.appendChild(buildSliderRow('Link Strength', 'simulation.linkStrength', 0, 1, 0.01, (val) => {
    const G = getGraph?.();
    if (G) {
      G.d3Force('link').strength(link => {
        if (link.linkType === 'relationship') return (link.strength || 0.5) * val;
        return val * 1.33;
      });
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

  // Reheat button
  const reheatBtn = document.createElement('button');
  reheatBtn.className = 'sp-btn';
  reheatBtn.textContent = '\u26A1 Reheat Simulation';
  reheatBtn.addEventListener('click', () => {
    const G = getGraph?.();
    if (G) G.d3ReheatSimulation();
  });
  container.appendChild(reheatBtn);
}

// ── Tab: Visuals ────────────────────────────────────────

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

// ── Tab: Camera ─────────────────────────────────────────

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

// ── Tab: Presets ─────────────────────────────────────────

function buildPresetsTab(container) {
  // Export / Import
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
    document.getElementById('settings-import-input').click();
  });

  btnRow.appendChild(exportBtn);
  btnRow.appendChild(importBtn);
  container.appendChild(btnRow);

  // Wire file input
  const fileInput = document.getElementById('settings-import-input');
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (importSettings(reader.result)) {
        // Reload page to apply all settings cleanly
        window.location.reload();
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

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
      if (loadPreset(name)) {
        window.location.reload();
      }
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

// ── Utility: Slider row builder ─────────────────────────

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

  // Use saved setting, or current live value, or default
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
  return val.toFixed(3);
}

// ── Utility: Toggle builder ─────────────────────────────

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

// ── Stats HUD ───────────────────────────────────────────

export function updateStats(stats) {
  setText('stat-entities', stats.entities);
  setText('stat-memories', stats.memories);
  setText('stat-patterns', stats.patterns);
  setText('stat-relationships', stats.relationships);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

// ── Timeline ────────────────────────────────────────────

export function updateTimeline(events) {
  timelineEvents = events;
  if (events.length === 0) return;

  const dates = events.map(e => new Date(e.timestamp?.replace(' ', 'T')));
  const validDates = dates.filter(d => !isNaN(d.getTime()));
  if (validDates.length === 0) return;

  timelineRange.start = new Date(Math.min(...validDates));
  timelineRange.end = new Date(Math.max(...validDates));

  const startLabel = document.getElementById('timeline-start');
  const endLabel = document.getElementById('timeline-end');
  if (startLabel) startLabel.textContent = formatDate(timelineRange.start.toISOString());
  if (endLabel) endLabel.textContent = 'Now';

  drawDensityHistogram(events);
}

function drawDensityHistogram(events) {
  const container = document.getElementById('timeline-density');
  container.replaceChildren();

  if (events.length === 0 || !timelineRange.start || !timelineRange.end) return;

  const totalMs = timelineRange.end - timelineRange.start;
  if (totalMs <= 0) return;

  const bucketCount = 60;
  const buckets = new Array(bucketCount).fill(0);
  const bucketSize = totalMs / bucketCount;

  for (const event of events) {
    const d = new Date(event.timestamp?.replace(' ', 'T'));
    if (isNaN(d.getTime())) continue;
    const bucket = Math.min(bucketCount - 1, Math.floor((d - timelineRange.start) / bucketSize));
    buckets[bucket]++;
  }

  const maxCount = Math.max(...buckets, 1);

  for (let i = 0; i < bucketCount; i++) {
    const bar = document.createElement('div');
    bar.style.cssText = `
      display: inline-block;
      width: ${100 / bucketCount}%;
      height: ${(buckets[i] / maxCount) * 16}px;
      background: var(--accent);
      opacity: ${0.2 + (buckets[i] / maxCount) * 0.6};
      vertical-align: bottom;
    `;
    container.appendChild(bar);
  }
}

function initTimeline() {
  const slider = document.getElementById('timeline-slider');
  const currentLabel = document.getElementById('timeline-current');
  const playBtn = document.getElementById('timeline-play');
  const speedBtn = document.getElementById('timeline-speed');

  let playing = false;
  let speed = 1;
  let playInterval = null;

  slider.addEventListener('input', () => {
    const pct = parseInt(slider.value, 10) / 100;
    if (!timelineRange.start || !timelineRange.end) return;

    const totalMs = timelineRange.end - timelineRange.start;
    const cutoffDate = new Date(timelineRange.start.getTime() + totalMs * pct);

    if (currentLabel) {
      currentLabel.textContent = formatDate(cutoffDate.toISOString());
    }

    if (pct >= 0.99) {
      if (onResetFilter) onResetFilter();
    } else {
      if (onFilterNodes) {
        onFilterNodes(node => {
          if (!node.createdAt) return true;
          const d = new Date(node.createdAt.replace(' ', 'T'));
          return d <= cutoffDate;
        });
      }
    }
  });

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '\u23F8' : '\u25B6';

    if (playing) {
      let value = parseInt(slider.value, 10);
      if (value >= 100) value = 0;

      playInterval = setInterval(() => {
        value = Math.min(100, value + speed);
        slider.value = value;
        slider.dispatchEvent(new Event('input'));
        if (value >= 100) {
          playing = false;
          playBtn.textContent = '\u25B6';
          clearInterval(playInterval);
        }
      }, 100);
    } else {
      clearInterval(playInterval);
    }
  });

  speedBtn.addEventListener('click', () => {
    const speeds = [1, 2, 5, 10];
    const idx = (speeds.indexOf(speed) + 1) % speeds.length;
    speed = speeds[idx];
    speedBtn.textContent = `${speed}x`;
  });
}
