/**
 * Claudia Brain -- Organic synaptic connections
 *
 * Configures 3d-force-graph's link rendering for the "digital brain" look:
 * - Curved links (dendrite-like arcs)
 * - Directional particles (synapse firing)
 * - On-demand particle emission via emitParticle()
 *
 * Colors and particle styling are read from the active theme.
 */

import { getGraphInstance, getHighlightLinks } from './graph.js';
import { getActiveTheme, getActiveThemeId, onThemeChange } from './themes.js';
import { getSetting } from './settings.js';

// Re-configure links when theme actually changes (guard against redundant calls)
let lastLinkThemeId = null;
onThemeChange(() => {
  const currentId = getActiveThemeId();
  if (currentId === lastLinkThemeId) return;
  lastLinkThemeId = currentId;
  const Graph = getGraphInstance();
  if (Graph) configureLinks(Graph);
});

// ── Link configuration (called on Graph instance) ────────

export function configureLinks(Graph) {
  const theme = getActiveTheme();
  const curvature = getSetting('visuals.linkCurvature') ?? 0.25;
  const particleSpeed = getSetting('visuals.particleSpeed') ?? 0.004;
  const particleWidth = getSetting('visuals.particleWidth') ?? 1.5;
  const maxParticles = getSetting('performance.maxParticles') ?? 2;

  Graph
    // Hide historical/cooling relationships if toggled off
    .linkVisibility(link => {
      if (link.historical && getSetting('performance.showHistorical') === false) return false;
      return true;
    })

    // Curved links -- organic dendrite look
    .linkCurvature(link => {
      if (link.linkType === 'relationship') return curvature;
      return curvature * 0.6;
    })
    .linkCurveRotation(link => {
      // Vary curve plane using link id hash for visual variety
      const str = link.id || `${link.source}-${link.target}`;
      let hash = 0;
      for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
      return (hash & 0xff) * 0.025;
    })

    // Width based on type and strength
    .linkWidth(link => {
      if (getHighlightLinks().has(link)) return 2.5;
      if (link.linkType === 'relationship') return (link.strength || 0.5) * 2;
      return 0.3;
    })

    // Opacity
    .linkOpacity(0.6)

    // Color with alpha for visual hierarchy
    .linkColor(link => {
      if (getHighlightLinks().has(link)) return theme.links.highlight;
      if (link.color) return link.color;
      if (link.linkType === 'memory_entity') return theme.links.memoryEntity;
      if (link.dashed) return theme.links.historical;
      if (link.linkType === 'relationship') return theme.links.relationship;
      return theme.links.default;
    })

    // Synapse firing particles (continuous flow on relationships)
    .linkDirectionalParticles(link => {
      if (link.linkType === 'relationship') return maxParticles;
      return 0;
    })
    .linkDirectionalParticleSpeed(particleSpeed)
    .linkDirectionalParticleWidth(particleWidth)
    .linkDirectionalParticleColor(link => {
      if ((link.strength || 0) > 0.7) return theme.particles.strong;
      return theme.particles.normal;
    });
}

// ── On-demand synapse firing ────────────────────────────

/**
 * Fire a single particle along a link (synapse pulse).
 */
export function fireSynapse(link) {
  const Graph = getGraphInstance();
  if (!Graph) return;
  Graph.emitParticle(link);
}

/**
 * Burst of particles along a link (strong synapse event).
 */
export function fireSynapseBurst(link, count = 3) {
  const Graph = getGraphInstance();
  if (!Graph) return;
  for (let i = 0; i < count; i++) {
    setTimeout(() => Graph.emitParticle(link), i * 100);
  }
}

/**
 * Find links connected to a node and fire synapses on them.
 */
export function fireNodeSynapses(nodeId, graphData) {
  const Graph = getGraphInstance();
  if (!Graph) return;

  for (const link of graphData.links) {
    const sid = typeof link.source === 'object' ? link.source.id : link.source;
    const tid = typeof link.target === 'object' ? link.target.id : link.target;
    if (sid === nodeId || tid === nodeId) {
      if (link.linkType === 'relationship') {
        fireSynapseBurst(link);
      } else {
        fireSynapse(link);
      }
    }
  }
}
