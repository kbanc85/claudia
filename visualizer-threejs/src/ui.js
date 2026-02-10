/**
 * Claudia Brain — UI overlays
 * Search, type filters, detail panel, timeline scrubber, stats HUD.
 * Collapsible sidebar, keyboard shortcuts, hover tooltip.
 * Pure DOM code, engine-agnostic. Only import is effects.js for quality settings.
 */

import { setQuality, getQuality } from './effects.js';
import { config, onConfigUpdate, notifyConfigUpdate } from './config.js';

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
let onDatabaseSwitch = null;
let onClearSelection = null;

/**
 * Get current legend colors from config (dynamic, theme-aware)
 */
function getLegendColors() {
  return {
    ...config.entityColors,
    ...config.memoryColors
  };
}

export function initUI(data, callbacks) {
  graphData = data;
  onFocusNode = callbacks.focusNode;
  onFilterNodes = callbacks.filterNodes;
  onResetFilter = callbacks.resetFilter;
  onDatabaseSwitch = callbacks.databaseSwitch;
  onClearSelection = callbacks.clearSelection;

  initSearch();
  initFilters();
  initDetailPanel();
  initTimeline();
  initSettings();
  initDatabaseSelector();
  initSidebar();
  initKeyboardShortcuts();
  showKeyboardHints();

  // Subscribe to theme changes to update legend colors
  onConfigUpdate((path) => {
    if (path === '*' || path.startsWith('entityColors') || path.startsWith('memoryColors')) {
      rebuildFiltersAndLegend();
    }
  });
}

export function setGraphData(data) {
  graphData = data;
}

// ── Sidebar toggle ─────────────────────────────────────────

function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close');

  if (!sidebar || !toggleBtn) return;

  toggleBtn.addEventListener('click', () => toggleSidebar());
  if (closeBtn) closeBtn.addEventListener('click', () => closeSidebar());
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!sidebar) return;

  const isCollapsed = sidebar.classList.contains('collapsed');
  if (isCollapsed) {
    sidebar.classList.remove('collapsed');
    toggleBtn?.classList.add('sidebar-open');
  } else {
    closeSidebar();
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (!sidebar) return;
  sidebar.classList.add('collapsed');
  toggleBtn?.classList.remove('sidebar-open');
}

// ── Keyboard shortcuts ─────────────────────────────────────

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 's':
        e.preventDefault();
        toggleSidebar();
        break;
      case '/':
        e.preventDefault();
        openSidebarAndFocusSearch();
        break;
      case 'escape':
        closeDetailPanel();
        closeSidebar();
        if (onClearSelection) onClearSelection();
        break;
    }
  });
}

function openSidebarAndFocusSearch() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const searchInput = document.getElementById('search-input');

  if (sidebar?.classList.contains('collapsed')) {
    sidebar.classList.remove('collapsed');
    toggleBtn?.classList.add('sidebar-open');
  }

  setTimeout(() => searchInput?.focus(), 100);
}

function showKeyboardHints() {
  const hints = document.getElementById('keyboard-hints');
  if (!hints) return;

  // Only show on first visit
  if (localStorage.getItem('claudia-brain-hints-seen')) return;

  hints.classList.remove('hidden');
  localStorage.setItem('claudia-brain-hints-seen', '1');

  // Auto-hide after animation completes (4s delay + 0.5s fade)
  setTimeout(() => hints.classList.add('hidden'), 5000);
}

// ── Tooltip ────────────────────────────────────────────────

export function showTooltip(node, x, y) {
  const tooltip = document.getElementById('tooltip');
  const nameEl = document.getElementById('tooltip-name');
  const typeEl = document.getElementById('tooltip-type');
  const metaEl = document.getElementById('tooltip-meta');

  if (!tooltip || !node) return;

  nameEl.textContent = node.name || '';
  nameEl.style.color = node.color || '';

  typeEl.textContent = node.entityType || node.memoryType || node.nodeType || '';

  // Meta line: importance + access count
  const parts = [];
  if (node.importance !== undefined) parts.push('imp ' + node.importance.toFixed(2));
  if (node.accessCount) parts.push(node.accessCount + ' recalls');
  if (node.confidence !== undefined) parts.push('conf ' + node.confidence.toFixed(2));
  metaEl.textContent = parts.join(' \u00B7 ');
  metaEl.style.display = parts.length > 0 ? '' : 'none';

  // Position tooltip near cursor with offset
  const offsetX = 14;
  const offsetY = 14;
  let left = x + offsetX;
  let top = y + offsetY;

  // Keep within viewport
  const tw = 260;
  const th = 80;
  if (left + tw > window.innerWidth) left = x - tw - offsetX;
  if (top + th > window.innerHeight) top = y - th - offsetY;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.classList.remove('hidden');
}

export function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

// ── Search ──────────────────────────────────────────────────

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
      input.blur();
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
    .sort((a, b) => {
      // People always first
      const aIsPerson = a.entityType === 'person' ? 1 : 0;
      const bIsPerson = b.entityType === 'person' ? 1 : 0;
      if (aIsPerson !== bIsPerson) return bIsPerson - aIsPerson;
      // Within same tier, sort by importance
      return (b.importance || 0) - (a.importance || 0);
    })
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
        fetch('/api/entity/' + node.dbId)
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

// ── Filters ─────────────────────────────────────────────────

function initFilters() {
  buildFiltersUI();
  buildLegend();
}

function buildFiltersUI() {
  const entityFilters = document.getElementById('type-filters');
  const memoryFilters = document.getElementById('memory-filters');
  const colors = getLegendColors();

  entityFilters.replaceChildren();
  memoryFilters.replaceChildren();

  if (activeFilters.entities.size === 0) {
    for (const type of allEntityTypes) activeFilters.entities.add(type);
  }
  if (activeFilters.memories.size === 0) {
    for (const type of allMemoryTypes) activeFilters.memories.add(type);
  }

  for (const type of allEntityTypes) {
    entityFilters.appendChild(createFilterItem(type, colors[type], activeFilters.entities.has(type), (checked) => {
      if (checked) activeFilters.entities.add(type);
      else activeFilters.entities.delete(type);
      applyFilters();
    }));
  }

  for (const type of allMemoryTypes) {
    memoryFilters.appendChild(createFilterItem(type, colors[type], activeFilters.memories.has(type), (checked) => {
      if (checked) activeFilters.memories.add(type);
      else activeFilters.memories.delete(type);
      applyFilters();
    }));
  }
}

function rebuildFiltersAndLegend() {
  buildFiltersUI();
  buildLegend();
}

function createFilterItem(type, color, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'filter-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(checkbox.checked));

  const dot = document.createElement('span');
  dot.className = 'filter-dot';
  dot.style.background = color;

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

function buildLegend() {
  const legend = document.getElementById('legend');
  const colors = getLegendColors();

  legend.replaceChildren();

  // Re-add h3 title
  const h3 = document.createElement('h3');
  h3.textContent = 'Shapes';
  legend.appendChild(h3);

  const shapes = [
    { label: 'Person', shape: 'circle', color: colors.person },
    { label: 'Organization', shape: 'square', color: colors.organization },
    { label: 'Project', shape: 'diamond', color: colors.project },
    { label: 'Concept', shape: 'circle', color: colors.concept },
    { label: 'Pattern', shape: 'circle', color: colors.pattern }
  ];

  for (const item of shapes) {
    const row = document.createElement('div');
    row.className = 'filter-item';
    row.style.cursor = 'default';

    const dot = document.createElement('span');
    dot.className = 'filter-dot';
    dot.style.background = item.color;
    if (item.shape === 'square') dot.style.borderRadius = '2px';
    if (item.shape === 'diamond') {
      dot.style.borderRadius = '2px';
      dot.style.transform = 'rotate(45deg)';
    }

    const text = document.createElement('span');
    text.textContent = item.label;
    text.style.fontSize = '11px';
    text.style.color = 'var(--text-dim)';

    row.appendChild(dot);
    row.appendChild(text);
    legend.appendChild(row);
  }
}

// ── Detail panel ────────────────────────────────────────────

function initDetailPanel() {
  const closeBtn = document.getElementById('detail-close');
  closeBtn.addEventListener('click', () => closeDetailPanel());
}

function closeDetailPanel() {
  document.getElementById('detail-panel')?.classList.add('hidden');
}

export function showDetail(node, apiDetail) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  content.replaceChildren();
  panel.classList.remove('hidden');

  // Hero header with colored accent bar
  const hero = document.createElement('div');
  hero.className = 'detail-hero';

  const accent = document.createElement('div');
  accent.className = 'detail-hero-accent';
  accent.style.background = node.color || 'var(--accent)';

  const h2 = document.createElement('h2');
  h2.textContent = node.name;
  h2.style.color = node.color;

  const typeLabel = document.createElement('div');
  typeLabel.className = 'detail-hero-type';
  typeLabel.textContent = node.entityType || node.memoryType || node.nodeType;

  hero.appendChild(accent);
  hero.appendChild(h2);
  hero.appendChild(typeLabel);
  content.appendChild(hero);

  // Importance arc + stats row
  if (node.importance !== undefined) {
    const row = document.createElement('div');
    row.className = 'detail-importance-row';

    // SVG arc (built with safe DOM methods)
    const arcDiv = document.createElement('div');
    arcDiv.className = 'importance-arc';

    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const offset = (1 - node.importance) * circumference;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 36 36');

    const bgCircle = document.createElementNS(svgNS, 'circle');
    bgCircle.setAttribute('class', 'importance-arc-bg');
    bgCircle.setAttribute('cx', '18');
    bgCircle.setAttribute('cy', '18');
    bgCircle.setAttribute('r', String(radius));

    const fgCircle = document.createElementNS(svgNS, 'circle');
    fgCircle.setAttribute('class', 'importance-arc-fg');
    fgCircle.setAttribute('cx', '18');
    fgCircle.setAttribute('cy', '18');
    fgCircle.setAttribute('r', String(radius));
    fgCircle.setAttribute('stroke-dasharray', String(circumference));
    fgCircle.setAttribute('stroke-dashoffset', String(offset));
    fgCircle.style.stroke = node.color || 'var(--accent)';

    svg.appendChild(bgCircle);
    svg.appendChild(fgCircle);
    arcDiv.appendChild(svg);

    const valueSpan = document.createElement('span');
    valueSpan.className = 'importance-value';
    valueSpan.textContent = String(Math.round(node.importance * 100));
    arcDiv.appendChild(valueSpan);

    const details = document.createElement('div');
    details.className = 'importance-details';

    const impLabel = document.createElement('span');
    impLabel.className = 'detail-stat-label';
    impLabel.textContent = 'Importance';
    details.appendChild(impLabel);

    if (node.confidence !== undefined) {
      const confVal = document.createElement('span');
      confVal.className = 'detail-stat-value';
      confVal.textContent = 'Conf: ' + node.confidence.toFixed(2);
      details.appendChild(confVal);
    }

    if (node.accessCount) {
      const accessVal = document.createElement('span');
      accessVal.className = 'detail-stat-value';
      accessVal.textContent = node.accessCount + ' recalls';
      details.appendChild(accessVal);
    }

    row.appendChild(arcDiv);
    row.appendChild(details);
    content.appendChild(row);
  }

  // Description
  if (node.description || node.content) {
    const descSection = createSection('Description');
    const descText = document.createElement('div');
    descText.className = 'detail-item';
    descText.style.cursor = 'default';
    descText.textContent = node.description || node.content;
    descSection.appendChild(descText);
    content.appendChild(descSection);
  }

  // Properties
  const hasProps = node.verificationStatus || node.createdAt || node.llmImproved;
  if (hasProps) {
    const propsSection = createSection('Properties');

    if (node.verificationStatus) {
      propsSection.appendChild(createStatRow('Status', node.verificationStatus));
    }
    if (node.createdAt) {
      propsSection.appendChild(createStatRow('Created', formatDate(node.createdAt)));
    }
    if (node.llmImproved) {
      propsSection.appendChild(createStatRow('Refined', 'LLM-improved'));
    }

    content.appendChild(propsSection);
  }

  // API detail: relationships as chips
  if (apiDetail) {
    if (apiDetail.relationships?.length > 0) {
      const relSection = createSection('Relationships (' + apiDetail.relationships.length + ')');
      const chips = document.createElement('div');
      chips.className = 'detail-chips';

      for (const rel of apiDetail.relationships) {
        const chip = document.createElement('div');
        chip.className = 'detail-chip';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = rel.other_name;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'detail-chip-type';
        typeSpan.textContent = rel.relationship_type;

        chip.appendChild(nameSpan);
        chip.appendChild(typeSpan);

        chip.title = rel.relationship_type + ' \u00B7 strength ' + (rel.strength?.toFixed(2) || '?') + ' \u00B7 ' + rel.direction;

        chip.addEventListener('click', () => {
          const targetNode = graphData?.nodes.find(n => n.id === 'entity-' + rel.other_id);
          if (targetNode && onFocusNode) onFocusNode(targetNode);
        });

        chips.appendChild(chip);
      }

      relSection.appendChild(chips);
      content.appendChild(relSection);
    }

    if (apiDetail.memories?.length > 0) {
      const memSection = createSection('Memories (' + apiDetail.memories.length + ')');
      for (const mem of apiDetail.memories.slice(0, 15)) {
        const item = document.createElement('div');
        item.className = 'detail-item';

        const text = document.createElement('div');
        text.textContent = mem.content;

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        const parts = [mem.type];
        if (mem.importance) parts.push('imp: ' + mem.importance.toFixed(2));
        if (mem.relationship) parts.push(mem.relationship);
        meta.textContent = parts.join(' \u00B7 ');

        item.appendChild(text);
        item.appendChild(meta);

        item.addEventListener('click', () => {
          const memNode = graphData?.nodes.find(n => n.id === 'memory-' + mem.id);
          if (memNode && onFocusNode) onFocusNode(memNode);
        });

        memSection.appendChild(item);
      }
      content.appendChild(memSection);
    }

    if (apiDetail.documents?.length > 0) {
      const docSection = createSection('Documents (' + apiDetail.documents.length + ')');
      for (const doc of apiDetail.documents) {
        const item = document.createElement('div');
        item.className = 'detail-item';
        item.style.cursor = 'default';

        const name = document.createElement('div');
        name.textContent = doc.filename;

        const meta = document.createElement('div');
        meta.className = 'detail-meta';
        const parts = [doc.source_type || 'file', doc.relationship];
        if (doc.storage_path) parts.push(doc.storage_path);
        meta.textContent = parts.join(' \u00B7 ');

        item.appendChild(name);
        item.appendChild(meta);
        docSection.appendChild(item);
      }
      content.appendChild(docSection);
    }

    if (apiDetail.aliases?.length > 0) {
      const aliasSection = createSection('Also known as');
      const chips = document.createElement('div');
      chips.className = 'detail-chips';
      for (const a of apiDetail.aliases) {
        const chip = document.createElement('div');
        chip.className = 'detail-chip';
        chip.style.cursor = 'default';
        chip.textContent = a.alias;
        chips.appendChild(chip);
      }
      aliasSection.appendChild(chips);
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

function createStatRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-stat-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'value';
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Settings panel ──────────────────────────────────────────

function initSettings() {
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

  const radios = panel.querySelectorAll('input[name="quality"]');
  for (const radio of radios) {
    radio.addEventListener('change', () => {
      if (radio.checked) setQuality(radio.value);
    });
  }

  const current = getQuality();
  const currentRadio = panel.querySelector('input[value="' + current + '"]');
  if (currentRadio) currentRadio.checked = true;

  // Resolution radios
  const resRadios = panel.querySelectorAll('input[name="resolution"]');
  for (const radio of resRadios) {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        config.resolution.scale = parseFloat(radio.value);
        notifyConfigUpdate('resolution.scale');
      }
    });
  }

  // Set current resolution
  const currentScale = String(config.resolution.scale || 0);
  const currentResRadio = panel.querySelector('input[name="resolution"][value="' + currentScale + '"]');
  if (currentResRadio) currentResRadio.checked = true;
}

// ── Database selector ────────────────────────────────────────

async function initDatabaseSelector() {
  const selector = document.getElementById('db-selector');
  if (!selector) return;

  try {
    const response = await fetch('/api/databases');
    const data = await response.json();

    selector.replaceChildren();

    if (!data.databases || data.databases.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No databases found';
      opt.disabled = true;
      selector.appendChild(opt);
      return;
    }

    for (const db of data.databases) {
      const opt = document.createElement('option');
      opt.value = db.path;
      opt.textContent = db.label + (db.isCurrent ? ' \u25CF' : '');
      if (db.isCurrent) {
        opt.selected = true;
        if (db.entityCount !== null) {
          opt.textContent = db.label + ' (' + db.entityCount + ')';
        }
      }
      selector.appendChild(opt);
    }

    selector.addEventListener('change', async () => {
      const selectedPath = selector.value;
      if (!selectedPath) return;

      selector.disabled = true;
      try {
        const switchResponse = await fetch('/api/database/switch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedPath })
        });

        const result = await switchResponse.json();

        if (result.success) {
          await initDatabaseSelector();
          if (onDatabaseSwitch) onDatabaseSwitch();
        } else {
          console.error('Failed to switch database:', result.error);
        }
      } catch (err) {
        console.error('Database switch error:', err);
      } finally {
        selector.disabled = false;
      }
    });

  } catch (err) {
    console.error('Failed to load databases:', err);
    const opt = document.createElement('option');
    opt.textContent = 'Error loading';
    opt.disabled = true;
    selector.replaceChildren(opt);
  }
}

export async function refreshDatabaseSelector() {
  await initDatabaseSelector();
}

// ── Stats HUD ───────────────────────────────────────────────

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

// ── Timeline ────────────────────────────────────────────────

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
    const heightPx = (buckets[i] / maxCount) * 14;
    const opacity = 0.15 + (buckets[i] / maxCount) * 0.5;
    bar.style.display = 'inline-block';
    bar.style.width = (100 / bucketCount) + '%';
    bar.style.height = heightPx + 'px';
    bar.style.background = 'var(--accent)';
    bar.style.opacity = String(opacity);
    bar.style.verticalAlign = 'bottom';
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
    speedBtn.textContent = speed + 'x';
  });
}
