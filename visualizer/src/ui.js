/**
 * Claudia Brain — UI overlays
 * Search, type filters, detail panel, timeline scrubber, stats HUD.
 * Ported from public/ui.js to work with Babylon.js graph module.
 */

import { setQuality, getQuality } from './effects.js';

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

const TYPE_COLORS = {
  person: '#fbbf24', organization: '#60a5fa', project: '#34d399',
  concept: '#c084fc', location: '#fb923c',
  fact: '#e2e8f0', commitment: '#f87171', learning: '#4ade80',
  observation: '#93c5fd', preference: '#fbbf24', pattern: '#a78bfa'
};

export function initUI(data, callbacks) {
  graphData = data;
  onFocusNode = callbacks.focusNode;
  onFilterNodes = callbacks.filterNodes;
  onResetFilter = callbacks.resetFilter;

  initSearch();
  initFilters();
  initDetailPanel();
  initTimeline();
  initSettings();
}

export function setGraphData(data) {
  graphData = data;
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

// ── Filters ─────────────────────────────────────────────────

function initFilters() {
  const entityFilters = document.getElementById('type-filters');
  const memoryFilters = document.getElementById('memory-filters');

  for (const type of allEntityTypes) activeFilters.entities.add(type);
  for (const type of allMemoryTypes) activeFilters.memories.add(type);

  for (const type of allEntityTypes) {
    entityFilters.appendChild(createFilterItem(type, TYPE_COLORS[type], true, (checked) => {
      if (checked) activeFilters.entities.add(type);
      else activeFilters.entities.delete(type);
      applyFilters();
    }));
  }

  for (const type of allMemoryTypes) {
    memoryFilters.appendChild(createFilterItem(type, TYPE_COLORS[type], true, (checked) => {
      if (checked) activeFilters.memories.add(type);
      else activeFilters.memories.delete(type);
      applyFilters();
    }));
  }

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
  const shapes = [
    { label: 'Person', shape: 'circle', color: TYPE_COLORS.person },
    { label: 'Organization', shape: 'square', color: TYPE_COLORS.organization },
    { label: 'Project', shape: 'diamond', color: TYPE_COLORS.project },
    { label: 'Concept', shape: 'circle', color: TYPE_COLORS.concept },
    { label: 'Pattern', shape: 'circle', color: TYPE_COLORS.pattern }
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
    text.style.fontSize = '12px';
    text.style.color = 'var(--text-dim)';

    row.appendChild(dot);
    row.appendChild(text);
    legend.appendChild(row);
  }
}

// ── Detail panel ────────────────────────────────────────────

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
  const currentRadio = panel.querySelector(`input[value="${current}"]`);
  if (currentRadio) currentRadio.checked = true;
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
