import { CONFIG } from './config.js';

/**
 * HUD management for the brain visualizer.
 *
 * All UI is plain DOM manipulation -- no framework. The HUD consists of:
 * - Top bar: logo, stats chips, quality selector
 * - Search panel: text input with keystroke callback
 * - Legend: color-coded node type reference
 * - FPS counter: updated each frame
 * - Tooltip: follows cursor on entity hover
 * - Detail panel: right-side drawer showing entity details
 * - Loading overlay: shown during initial graph fetch
 */

let _hudVisible = true;
let _statsPoller = null;

/** @type {HTMLElement} */
let _statEntities;
/** @type {HTMLElement} */
let _statMemories;
/** @type {HTMLElement} */
let _statRels;
/** @type {HTMLInputElement} */
let _searchInput;
/** @type {HTMLElement} */
let _tooltip;
/** @type {HTMLElement} */
let _detailPanel;
/** @type {HTMLElement} */
let _detailContent;
/** @type {HTMLElement} */
let _loadingOverlay;

// Memory color map for border-left styling on memory items
const MEMORY_COLORS = {
  fact: '#e2e8f0',
  commitment: '#f87171',
  learning: '#4ade80',
  observation: '#93c5fd',
  preference: '#fbbf24',
  pattern: '#a78bfa',
};

/**
 * Initialize UI references and wire up event listeners.
 * Call once after DOM is ready.
 */
export function initUI() {
  _statEntities = document.getElementById('stat-entities');
  _statMemories = document.getElementById('stat-memories');
  _statRels = document.getElementById('stat-relationships');
  _searchInput = document.getElementById('search-input');
  _tooltip = document.getElementById('node-tooltip');
  _detailPanel = document.getElementById('detail-panel');
  _detailContent = document.getElementById('detail-content');
  _loadingOverlay = document.getElementById('loading-overlay'); // optional

  // Close button on detail panel
  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDetailPanel);
  }

  // Controls toggle
  const controlsToggle = document.getElementById('controls-toggle');
  const controlsPanel = document.getElementById('controls-panel');
  if (controlsToggle && controlsPanel) {
    controlsToggle.addEventListener('click', () => {
      const open = controlsPanel.classList.toggle('open');
      controlsToggle.classList.toggle('active', open);
    });
  }

  // Bloom slider
  const bloomSlider = document.getElementById('bloom-slider');
  if (bloomSlider) {
    bloomSlider.addEventListener('input', () => {
      window.dispatchEvent(new CustomEvent('bloom-change', { detail: { strength: parseFloat(bloomSlider.value) } }));
    });
  }

  // Chromatic aberration slider
  const aberrSlider = document.getElementById('aberr-slider');
  if (aberrSlider) {
    aberrSlider.addEventListener('input', () => {
      window.dispatchEvent(new CustomEvent('aberr-change', { detail: { offset: parseFloat(aberrSlider.value) } }));
    });
  }

  // Rotate toggle
  const rotateBtn = document.getElementById('rotate-btn');
  if (rotateBtn) {
    rotateBtn.addEventListener('click', () => {
      const active = rotateBtn.classList.toggle('active');
      rotateBtn.textContent = active ? 'On' : 'Off';
      window.dispatchEvent(new CustomEvent('rotation-change', { detail: { active } }));
    });
  }

  // Quality buttons
  const qualBtns = document.querySelectorAll('.qual-btn');
  qualBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      qualBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.dispatchEvent(new CustomEvent('quality-change', { detail: { level: btn.dataset.q } }));
    });
  });
}

/**
 * Update the stat chips in the top HUD bar.
 * Note: backend sends relationships as a plain number, entities/memories as {total, byType}.
 * @param {{ entities: { total: number }, memories: { total: number }, relationships: number }} stats
 */
export function updateStats(stats) {
  if (!stats) return;
  if (_statEntities && stats.entities) {
    _statEntities.textContent = stats.entities.total ?? 0;
  }
  if (_statMemories && stats.memories) {
    _statMemories.textContent = stats.memories.total ?? 0;
  }
  if (_statRels) {
    _statRels.textContent = stats.relationships ?? 0;
  }
}

/**
 * Set the quality level programmatically.
 * @param {'LOW'|'MEDIUM'|'HIGH'|'ULTRA'} level
 */
export function setQuality(level) {
  window.dispatchEvent(new CustomEvent('quality-change', { detail: { level } }));
}

/**
 * Toggle visibility of all HUD panels using the body class approach
 * defined in the CSS (.hud-hidden selector).
 */
export function toggleHUD() {
  _hudVisible = !_hudVisible;
  document.body.classList.toggle('hud-hidden', !_hudVisible);
}

/**
 * Attach a search callback that fires on each keystroke.
 * @param {(query: string) => void} callback
 */
export function onSearch(callback) {
  if (_searchInput) {
    _searchInput.addEventListener('input', () => {
      callback(_searchInput.value);
    });
  }
}

/**
 * Start polling /api/stats at a regular interval and update the HUD.
 * @param {string} url - Base URL of the backend (e.g., 'http://localhost:3849')
 * @param {number} [intervalMs=5000] - Polling interval
 */
export function initStatsPoller(url, intervalMs = 5000) {
  if (_statsPoller) clearInterval(_statsPoller);

  const poll = async () => {
    try {
      const res = await fetch(`${url}/api/stats`);
      if (res.ok) {
        const stats = await res.json();
        updateStats(stats);
      }
    } catch {
      // Backend unavailable, silently skip
    }
  };

  // Poll immediately, then on interval
  poll();
  _statsPoller = setInterval(poll, intervalMs);
}

/**
 * Stop the stats poller (for cleanup).
 */
export function stopStatsPoller() {
  if (_statsPoller) {
    clearInterval(_statsPoller);
    _statsPoller = null;
  }
}

/**
 * Clear the search input.
 */
export function clearSearch() {
  if (_searchInput) {
    _searchInput.value = '';
  }
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

/**
 * Show a tooltip near the cursor with the given text.
 * @param {string} text - Tooltip content
 * @param {number} clientX - Mouse X position
 * @param {number} clientY - Mouse Y position
 */
export function showTooltip(text, clientX, clientY) {
  if (!_tooltip) return;
  _tooltip.textContent = text;
  _tooltip.style.left = `${clientX + 14}px`;
  _tooltip.style.top = `${clientY - 8}px`;
  _tooltip.style.display = 'block';
}

/**
 * Hide the tooltip.
 */
export function hideTooltip() {
  if (!_tooltip) return;
  _tooltip.style.display = 'none';
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

/**
 * Open the detail panel with entity data from the API.
 * Builds content using safe DOM construction (no innerHTML).
 *
 * @param {object} data - Entity data from /api/entity/:id
 * @param {() => void} onIsolate - Called when Isolate button is clicked
 * @param {() => void} onReset - Called when Reset button is clicked
 */
export function openDetailPanel(data, onIsolate, onReset) {
  if (!_detailPanel || !_detailContent) return;

  // The API returns { entity, memories, relationships }
  const entity = data.entity || data; // fallback if flat object passed

  // Clear previous content
  _detailContent.replaceChildren();

  const fragment = document.createDocumentFragment();

  // Entity name
  const nameEl = document.createElement('div');
  nameEl.className = 'detail-name';
  nameEl.textContent = entity.name || 'Unknown';
  fragment.appendChild(nameEl);

  // Type badge + memory count
  const typeEl = document.createElement('span');
  typeEl.className = 'detail-type-badge';
  typeEl.textContent = entity.type || 'entity';
  const typeColor = CONFIG.NODE_COLORS[entity.type] || '#94a3b8';
  typeEl.style.color = typeColor;
  fragment.appendChild(typeEl);

  const memories = data.memories || [];
  if (memories.length > 0) {
    const memCountEl = document.createElement('span');
    memCountEl.className = 'detail-memory-count';
    memCountEl.textContent = `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;
    fragment.appendChild(memCountEl);
  }

  // Importance bar
  const importance = entity.importance || 0;
  const barBg = document.createElement('div');
  barBg.className = 'importance-bar-bg';
  const barFill = document.createElement('div');
  barFill.className = 'importance-bar-fill';
  barFill.style.width = `${Math.round(importance * 100)}%`;
  barBg.appendChild(barFill);
  fragment.appendChild(barBg);

  // Description
  if (entity.description) {
    const desc = document.createElement('div');
    desc.className = 'detail-description';
    desc.textContent = entity.description;
    fragment.appendChild(desc);
  }

  // Recent memories
  if (memories.length > 0) {
    const memTitle = document.createElement('div');
    memTitle.className = 'detail-section-title';
    memTitle.textContent = 'Recent Memories';
    fragment.appendChild(memTitle);

    for (const mem of memories.slice(0, 5)) {
      const memEl = document.createElement('div');
      memEl.className = 'memory-item';
      memEl.textContent = mem.content || mem.fact || '';
      const memType = mem.type || 'fact';
      memEl.style.borderLeftColor = MEMORY_COLORS[memType] || '#e2e8f0';
      fragment.appendChild(memEl);
    }
  }

  // Relationships
  const relationships = data.relationships || [];
  if (relationships.length > 0) {
    const relTitle = document.createElement('div');
    relTitle.className = 'detail-section-title';
    relTitle.textContent = 'Relationships';
    fragment.appendChild(relTitle);

    for (const rel of relationships.slice(0, 5)) {
      const relName = rel.other_name || rel.target_name || rel.source_name || 'related';
      const strength = rel.strength || 0.5;

      const relItem = document.createElement('div');
      relItem.className = 'rel-item';

      const relLabel = document.createElement('span');
      relLabel.textContent = relName;
      relItem.appendChild(relLabel);

      const relBar = document.createElement('div');
      relBar.className = 'rel-strength';
      const relFill = document.createElement('div');
      relFill.className = 'rel-strength-fill';
      relFill.style.width = `${Math.round(strength * 100)}%`;
      relBar.appendChild(relFill);
      relItem.appendChild(relBar);

      const pct = document.createElement('span');
      pct.style.opacity = '0.5';
      pct.style.fontSize = '11px';
      pct.style.minWidth = '32px';
      pct.textContent = `${Math.round(strength * 100)}%`;
      relItem.appendChild(pct);

      fragment.appendChild(relItem);
    }
  }

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  const isolateBtn = document.createElement('button');
  isolateBtn.className = 'btn-isolate';
  isolateBtn.textContent = 'Isolate';
  isolateBtn.addEventListener('click', () => {
    if (onIsolate) {
      onIsolate();
      isolateBtn.style.display = 'none';
      resetBtn.style.display = 'block';
    }
  });
  actions.appendChild(isolateBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn-reset';
  resetBtn.style.display = 'none';
  resetBtn.textContent = 'Reset View';
  resetBtn.addEventListener('click', () => {
    if (onReset) {
      onReset();
      resetBtn.style.display = 'none';
      isolateBtn.style.display = 'block';
    }
  });
  actions.appendChild(resetBtn);

  fragment.appendChild(actions);
  _detailContent.appendChild(fragment);

  // Slide panel in
  _detailPanel.classList.add('open');
}

/**
 * Close the detail panel with slide-out animation.
 */
export function closeDetailPanel() {
  if (_detailPanel) {
    _detailPanel.classList.remove('open');
  }
}

// ─── Loading Overlay ─────────────────────────────────────────────────────────

/**
 * Hide the loading overlay with a fade transition.
 */
export function hideLoading() {
  if (_loadingOverlay) {
    _loadingOverlay.classList.add('hidden');
  }
}

/**
 * Show the loading overlay.
 */
export function showLoading() {
  if (_loadingOverlay) {
    _loadingOverlay.classList.remove('hidden');
  }
}
