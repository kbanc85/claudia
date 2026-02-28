/**
 * Claudia Brain v4 -- Detail panel
 *
 * Right-side sliding panel showing node information.
 * Entity nodes fetch additional detail from /api/entity/:id.
 */

import { getGraphData, focusNode } from '../data/store.js';

export function initDetailPanel() {
  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('detail-panel').classList.add('hidden');
    });
  }
}

/**
 * Show detail panel for a node.
 * @param {Object} node - Graph node
 * @param {Object|null} apiDetail - Extra data from /api/entity/:id
 */
export function showDetail(node, apiDetail) {
  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');
  if (!panel || !content) return;

  content.replaceChildren();
  panel.classList.remove('hidden');

  // Header
  const header = document.createElement('div');
  header.className = 'detail-header';

  const h2 = document.createElement('h2');
  h2.textContent = node.name;
  h2.style.color = node.color || 'var(--text-bright)';

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
    descText.style.cursor = 'default';
    descText.textContent = node.description || node.content;
    descSection.appendChild(descText);
    content.appendChild(descSection);
  }

  // Properties
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

  // API detail sections
  if (!apiDetail) return;

  // Relationships
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
        const gd = getGraphData();
        const targetNode = gd?.nodes.find(n => n.id === `entity-${rel.other_id}`);
        if (targetNode) focusNode(targetNode);
      });

      relSection.appendChild(item);
    }
    content.appendChild(relSection);
  }

  // Memories
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
        const gd = getGraphData();
        const memNode = gd?.nodes.find(n => n.id === `memory-${mem.id}`);
        if (memNode) focusNode(memNode);
      });

      memSection.appendChild(item);
    }
    content.appendChild(memSection);
  }

  // Documents
  if (apiDetail.documents?.length > 0) {
    const docSection = createSection(`Documents (${apiDetail.documents.length})`);
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
      meta.textContent = parts.join(' | ');

      item.appendChild(name);
      item.appendChild(meta);
      docSection.appendChild(item);
    }
    content.appendChild(docSection);
  }

  // Aliases
  if (apiDetail.aliases?.length > 0) {
    const aliasSection = createSection('Also known as');
    const text = document.createElement('div');
    text.className = 'detail-item';
    text.style.cursor = 'default';
    text.textContent = apiDetail.aliases.map(a => a.alias).join(', ');
    aliasSection.appendChild(text);
    content.appendChild(aliasSection);
  }
}

// ── Helpers ──────────────────────────────────────────────

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
  item.style.cursor = 'default';
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
