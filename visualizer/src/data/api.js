/**
 * Claudia Brain v4.2 -- REST API client
 *
 * Thin fetch wrappers for all backend endpoints.
 */

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchGraph(opts = {}) {
  const params = new URLSearchParams();
  if (opts.historical) params.set('historical', 'true');
  const qs = params.toString();
  return get(`/api/graph${qs ? '?' + qs : ''}`);
}

export function fetchStats() {
  return get('/api/stats');
}

export function fetchEntity(id) {
  return get(`/api/entity/${id}`);
}

export function fetchTimeline(start, end) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  const qs = params.toString();
  return get(`/api/timeline${qs ? '?' + qs : ''}`);
}

export function fetchDatabases() {
  return get('/api/databases');
}

export async function switchDatabase(dbPath) {
  const res = await fetch('/api/database/switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: dbPath }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function fetchHealth() {
  return get('/health');
}

// ── Advanced graph endpoints ─────────────────────────────────────────

export function fetchOverviewGraph(opts = {}) {
  const params = new URLSearchParams();
  if (opts.includeMemories) params.set('includeMemories', 'true');
  const qs = params.toString();
  return get(`/api/graph/overview${qs ? '?' + qs : ''}`);
}

export function fetchNeighborhood(graphId, depth = 1) {
  return get(`/api/graph/neighborhood/${graphId}?depth=${depth}`);
}

export function fetchTrace(fromId, toId, maxDepth = 4) {
  return get(`/api/graph/trace?from=${fromId}&to=${toId}&maxDepth=${maxDepth}`);
}

export function fetchSearch(query, limit = 20) {
  return get(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export function fetchActiveCommitments(opts = {}) {
  const params = new URLSearchParams();
  if (opts.entityId) params.set('entityId', opts.entityId);
  if (opts.limit) params.set('limit', opts.limit);
  const qs = params.toString();
  return get(`/api/commitments/active${qs ? '?' + qs : ''}`);
}

export function fetchInsights() {
  return get('/api/insights');
}
