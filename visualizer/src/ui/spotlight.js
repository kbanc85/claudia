/**
 * Claudia Brain v4 -- Search / Spotlight
 *
 * Sidebar search with debounced fuzzy matching against node names/content.
 * Results sorted by importance, click to focus + show detail.
 */

import { getGraphData, focusNode } from '../data/store.js';

let onShowDetail = null;

export function initSearch(callbacks) {
  onShowDetail = callbacks?.showDetail || null;

  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  if (!input || !results) return;

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

  const gd = getGraphData();
  if (!gd?.nodes) return;

  const matches = gd.nodes
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
    typeBadge.style.color = node.color || 'var(--accent)';
    typeBadge.textContent = node.entityType || node.memoryType || node.nodeType;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = node.name;

    div.appendChild(typeBadge);
    div.appendChild(nameSpan);

    div.addEventListener('click', () => {
      focusNode(node);
      results.classList.remove('active');
      document.getElementById('search-input').value = node.name;

      if (node.nodeType === 'entity' && onShowDetail) {
        fetch(`/api/entity/${node.dbId}`)
          .then(r => r.json())
          .then(detail => onShowDetail(node, detail))
          .catch(() => onShowDetail(node, null));
      } else if (onShowDetail) {
        onShowDetail(node, null);
      }
    });

    results.appendChild(div);
  }

  results.classList.add('active');
}
