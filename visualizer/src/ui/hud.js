/**
 * Claudia Brain v4 -- HUD stats bar + sidebar info
 *
 * Updates entity/memory/pattern/relationship counts and FPS.
 * Activity pulse flashes on SSE events.
 * Also populates the sidebar info cards, entity/memory breakdown, and insights.
 */

import { isWebGPU } from '../renderer.js';
import { getFps } from '../effects/animations.js';
import { getActiveTheme } from '../themes.js';

let fpsEl = null;
let engineEl = null;
let pulseEl = null;
let pulseTimer = null;

export function initHUD() {
  fpsEl = document.getElementById('fps-counter');
  engineEl = document.getElementById('engine-info');
  pulseEl = document.getElementById('activity-pulse');

  if (engineEl) {
    engineEl.textContent = isWebGPU() ? 'WebGPU' : 'WebGL';
  }
}

/**
 * Update stats counters (HUD bar + sidebar info cards).
 * @param {Object} stats - { entities, memories, patterns, relationships, recentActivity, entityTypes, memoryTypes }
 * @param {Object} [graphData] - { nodes, links } for computing graph analytics
 */
export function updateStats(stats, graphData) {
  // HUD bar
  setText('stat-entities', stats.entities);
  setText('stat-memories', stats.memories);
  setText('stat-patterns', stats.patterns);
  setText('stat-relationships', stats.relationships);

  // Sidebar info grid
  setText('sidebar-entities', stats.entities);
  setText('sidebar-memories', stats.memories);
  setText('sidebar-relationships', stats.relationships);
  setText('sidebar-patterns', stats.patterns);

  // Recent activity
  const activityEl = document.getElementById('sidebar-activity');
  if (activityEl && stats.recentActivity != null) {
    activityEl.textContent = `${stats.recentActivity} memories in last 24h`;
  }

  // Entity breakdown chart
  if (stats.entityTypes) {
    renderBreakdown(stats.entityTypes);
  }

  // Memory breakdown chart
  if (stats.memoryTypes) {
    renderMemoryBreakdown(stats.memoryTypes);
  }

  // Graph insights
  if (graphData) {
    renderInsights(stats, graphData);
  }
}

/**
 * Render the entity type breakdown bar chart in the sidebar.
 */
function renderBreakdown(entityTypes) {
  const container = document.getElementById('entity-breakdown-chart');
  if (!container) return;

  container.replaceChildren();

  const theme = getActiveTheme();
  const maxCount = Math.max(...entityTypes.map(t => t.count), 1);

  for (const { type, count } of entityTypes) {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const dot = document.createElement('div');
    dot.className = 'breakdown-dot';
    dot.style.background = theme.entities[type] || '#888';

    const name = document.createElement('span');
    name.className = 'breakdown-name';
    name.textContent = type;

    const countEl = document.createElement('span');
    countEl.className = 'breakdown-count';
    countEl.textContent = count;

    const bar = document.createElement('div');
    bar.className = 'breakdown-bar';
    const fill = document.createElement('div');
    fill.className = 'breakdown-bar-fill';
    fill.style.width = `${(count / maxCount) * 100}%`;
    fill.style.background = theme.entities[type] || '#888';
    bar.appendChild(fill);

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(countEl);
    row.appendChild(bar);
    container.appendChild(row);
  }
}

/**
 * Render the memory type breakdown bar chart in the sidebar.
 */
function renderMemoryBreakdown(memoryTypes) {
  const container = document.getElementById('memory-breakdown-chart');
  if (!container) return;

  container.replaceChildren();

  const theme = getActiveTheme();
  const maxCount = Math.max(...memoryTypes.map(t => t.count), 1);

  for (const { type, count } of memoryTypes) {
    const row = document.createElement('div');
    row.className = 'breakdown-row';

    const dot = document.createElement('div');
    dot.className = 'breakdown-dot';
    dot.style.background = theme.memories[type] || '#888';

    const name = document.createElement('span');
    name.className = 'breakdown-name';
    name.textContent = type;

    const countEl = document.createElement('span');
    countEl.className = 'breakdown-count';
    countEl.textContent = count;

    const bar = document.createElement('div');
    bar.className = 'breakdown-bar';
    const fill = document.createElement('div');
    fill.className = 'breakdown-bar-fill';
    fill.style.width = `${(count / maxCount) * 100}%`;
    fill.style.background = theme.memories[type] || '#888';
    bar.appendChild(fill);

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(countEl);
    row.appendChild(bar);
    container.appendChild(row);
  }
}

/**
 * Render graph insights in the sidebar.
 */
function renderInsights(stats, graphData) {
  const container = document.getElementById('insights-content');
  if (!container) return;

  container.replaceChildren();

  const links = graphData.links || [];
  const nodes = graphData.nodes || [];

  // 1. Average relationship strength
  const relLinks = links.filter(l => l.linkType === 'relationship' && l.strength != null);
  const avgStrength = relLinks.length > 0
    ? relLinks.reduce((sum, l) => sum + (l.strength || 0), 0) / relLinks.length
    : 0;

  container.appendChild(createInsightRow(
    '\u26A1', 'Avg Strength',
    avgStrength > 0 ? avgStrength.toFixed(2) : '--'
  ));

  // 2. Most connected entity
  const entityNodes = nodes.filter(n => n.nodeType === 'entity');
  if (entityNodes.length > 0) {
    const degreeCounts = new Map();
    for (const link of links) {
      if (link.linkType !== 'relationship') continue;
      const sid = typeof link.source === 'object' ? link.source.id : link.source;
      const tid = typeof link.target === 'object' ? link.target.id : link.target;
      degreeCounts.set(sid, (degreeCounts.get(sid) || 0) + 1);
      degreeCounts.set(tid, (degreeCounts.get(tid) || 0) + 1);
    }

    let hubNode = null;
    let maxDegree = 0;
    for (const node of entityNodes) {
      const deg = degreeCounts.get(node.id) || 0;
      if (deg > maxDegree) {
        maxDegree = deg;
        hubNode = node;
      }
    }

    container.appendChild(createInsightRow(
      '\uD83C\uDF1F', 'Most Connected',
      hubNode ? `${truncate(hubNode.name, 14)} (${maxDegree})` : '--',
      true
    ));
  }

  // 3. Strongest bond
  if (relLinks.length > 0) {
    let strongest = relLinks[0];
    for (const l of relLinks) {
      if ((l.strength || 0) > (strongest.strength || 0)) strongest = l;
    }
    const sourceName = getNodeName(strongest.source, nodes);
    const targetName = getNodeName(strongest.target, nodes);
    container.appendChild(createInsightRow(
      '\uD83D\uDD17', 'Strongest Bond',
      `${truncate(sourceName, 8)}\u2194${truncate(targetName, 8)}`,
      false
    ));
  }

  // 4. Memory freshness (% from last 7 days)
  const memoryNodes = nodes.filter(n => n.nodeType === 'memory');
  if (memoryNodes.length > 0 && stats.recentActivity != null) {
    const freshPct = Math.min(100, Math.round((stats.recentActivity / memoryNodes.length) * 100));
    container.appendChild(createInsightRow(
      '\u23F1', 'Freshness (7d)',
      `${freshPct}%`
    ));
  }

  // 5. Graph density
  if (entityNodes.length > 1) {
    const maxEdges = (entityNodes.length * (entityNodes.length - 1)) / 2;
    const density = relLinks.length / maxEdges;
    container.appendChild(createInsightRow(
      '\u25C9', 'Graph Density',
      `${(density * 100).toFixed(1)}%`
    ));
  }
}

function createInsightRow(icon, label, value, highlight = false) {
  const row = document.createElement('div');
  row.className = 'insight-row';

  const labelDiv = document.createElement('span');
  labelDiv.className = 'insight-label';

  const iconSpan = document.createElement('span');
  iconSpan.className = 'insight-icon';
  iconSpan.textContent = icon;

  const textSpan = document.createElement('span');
  textSpan.textContent = label;

  labelDiv.appendChild(iconSpan);
  labelDiv.appendChild(textSpan);

  const valueDiv = document.createElement('span');
  valueDiv.className = 'insight-value' + (highlight ? ' highlight' : '');
  valueDiv.textContent = value;

  row.appendChild(labelDiv);
  row.appendChild(valueDiv);
  return row;
}

function getNodeName(nodeOrId, nodes) {
  if (typeof nodeOrId === 'object') return nodeOrId.name || nodeOrId.id || '?';
  const node = nodes.find(n => n.id === nodeOrId);
  return node?.name || nodeOrId || '?';
}

function truncate(str, maxLen) {
  if (!str) return '?';
  return str.length > maxLen ? str.substring(0, maxLen) + '\u2026' : str;
}

/**
 * Update FPS display. Call from render loop.
 */
export function updateFpsDisplay() {
  if (fpsEl) fpsEl.textContent = `${getFps()} FPS`;
}

/**
 * Flash the activity pulse (on SSE event).
 */
export function flashPulse() {
  if (!pulseEl) return;
  pulseEl.style.background = '#818cf8';
  pulseEl.style.boxShadow = '0 0 8px #818cf8';
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => {
    pulseEl.style.background = '#34d399';
    pulseEl.style.boxShadow = '0 0 6px #34d399';
  }, 1000);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? 0);
}
