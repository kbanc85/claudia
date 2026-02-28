/**
 * Claudia Brain v4 -- Link rendering
 *
 * Configures 3d-force-graph link appearance: curved dendrites,
 * directional particles (synapses), theme-aware colors.
 * Phase 4 will add GPU compute particles alongside these built-in ones.
 */

import { getGraphInstance, getHighlightLinks, getLinkVisibilityFilter } from '../data/store.js';
import { getActiveTheme, getActiveThemeId, onThemeChange } from '../themes.js';
import { getSetting } from '../settings.js';

// ── Shared hash helper (deterministic per-link variation) ──

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return hash;
}

function linkId(link) {
  const sid = typeof link.source === 'object' ? link.source.id : link.source;
  const tid = typeof link.target === 'object' ? link.target.id : link.target;
  return link.id || `${sid}-${tid}`;
}

let lastThemeId = null;
onThemeChange(() => {
  const currentId = getActiveThemeId();
  if (currentId === lastThemeId) return;
  lastThemeId = currentId;
  const Graph = getGraphInstance();
  if (Graph) configureLinks(Graph);
});

export function configureLinks(Graph) {
  const theme = getActiveTheme();
  const curvature = getSetting('visuals.linkCurvature') ?? 0.25;
  const particleSpeed = getSetting('visuals.particleSpeed') ?? 0.004;
  const particleWidth = getSetting('visuals.particleWidth') ?? 1.5;
  const maxParticles = getSetting('performance.maxParticles') ?? 2;

  Graph
    .linkVisibility(link => {
      if (link.historical && getSetting('performance.showHistorical') === false) return false;
      // Memory-entity links are hidden -- memories are rendered by the GPU
      // particle system, so the thin connecting lines are redundant and cost
      // ~1139 extra draw calls. Only keep entity-entity relationship links.
      if (link.linkType === 'memory_entity') return false;
      // Connection view presets filter
      const viewFilter = getLinkVisibilityFilter();
      if (viewFilter && !viewFilter(link)) return false;
      return true;
    })
    .linkCurvature(link => {
      if (link.linkType === 'relationship') return curvature;
      return curvature * 0.6;
    })
    .linkCurveRotation(link => {
      return (hashString(linkId(link)) & 0xff) * 0.025;
    })
    .linkWidth(link => {
      if (getHighlightLinks().has(link)) return 5.0;
      if (link.linkType === 'relationship') return (link.strength || 0.5) * 2;
      return 0.3;
    })
    .linkOpacity(0.6)
    .linkColor(link => {
      if (getHighlightLinks().has(link)) return theme.links.highlight;
      if (link.color) return link.color;
      if (link.linkType === 'memory_entity') return theme.links.memoryEntity;
      if (link.dashed) return theme.links.historical;
      if (link.linkType === 'relationship') return theme.links.relationship;
      return theme.links.default;
    })
    .linkDirectionalParticles(link => {
      if (link.linkType === 'relationship') return maxParticles;
      return 0;
    })
    .linkDirectionalParticleSpeed(link => {
      // Per-link speed variation: ±40% from base, deterministic via hash
      const base = particleSpeed;
      const hash = hashString(linkId(link));
      const variation = ((hash & 0xff) / 255) * 0.8 - 0.4; // -0.4 to +0.4
      const speed = base * (1 + variation);
      // Strong links get a 15% speed bonus
      if ((link.strength || 0) > 0.7) return speed * 1.15;
      return speed;
    })
    .linkDirectionalParticleWidth(particleWidth)
    .linkDirectionalParticleColor(link => {
      if ((link.strength || 0) > 0.7) return theme.particles.strong;
      return theme.particles.normal;
    });
}

export function fireSynapse(link) {
  const Graph = getGraphInstance();
  if (Graph) Graph.emitParticle(link);
}

export function fireSynapseBurst(link, count = 3) {
  const Graph = getGraphInstance();
  if (!Graph) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => Graph.emitParticle(link), i * 100);
  }
}

/**
 * Fire synapses from a clicked node.
 * Only fires on relationship links (max 20) to avoid stutter on high-degree nodes.
 */
export function fireNodeSynapses(nodeId, graphData) {
  const Graph = getGraphInstance();
  if (!Graph) return;

  let fired = 0;
  const MAX_FIRE = 20; // cap to prevent stutter

  for (const link of graphData.links) {
    if (fired >= MAX_FIRE) break;
    const sid = typeof link.source === 'object' ? link.source.id : link.source;
    const tid = typeof link.target === 'object' ? link.target.id : link.target;
    if (sid === nodeId || tid === nodeId) {
      if (link.linkType === 'relationship') {
        fireSynapseBurst(link);
        fired++;
      }
    }
  }
}
