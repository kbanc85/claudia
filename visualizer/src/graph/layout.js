/**
 * Claudia Brain v4 -- Force simulation layout wrapper
 *
 * Controls d3-force-3d simulation parameters.
 * Provides preset configurations for different graph sizes.
 */

import { getSetting } from '../settings.js';

/**
 * Apply simulation parameters to the graph.
 *
 * @param {Object} Graph - ForceGraph3D instance
 */
export function configureLayout(Graph) {
  const sim = Graph.d3Force;
  if (!sim) return;

  const charge = getSetting('simulation.chargeStrength') ?? -180;
  const linkDist = getSetting('simulation.linkDistance') ?? 80;
  const linkStr = getSetting('simulation.linkStrength') ?? 0.3;
  const velDecay = getSetting('simulation.velocityDecay') ?? 0.4;
  const alphaDecay = getSetting('simulation.alphaDecay') ?? 0.02;

  try {
    sim('charge')?.strength(charge);
    sim('link')?.distance(linkDist)?.strength(linkStr);
    Graph.d3VelocityDecay(velDecay);
    Graph.d3AlphaDecay(alphaDecay);
  } catch (e) {
    console.warn('[Layout] Simulation tuning error:', e);
  }
}

/**
 * Apply a size-adaptive preset based on node count.
 * Large graphs need weaker forces to avoid visual chaos.
 */
export function autoTuneLayout(Graph, nodeCount) {
  if (nodeCount > 2000) {
    // Large graph: spread out, weaker forces
    Graph.d3Force('charge')?.strength(-80);
    Graph.d3Force('link')?.distance(120)?.strength(0.15);
    Graph.d3VelocityDecay(0.6);
    Graph.d3AlphaDecay(0.03);
  } else if (nodeCount > 500) {
    // Medium graph
    Graph.d3Force('charge')?.strength(-150);
    Graph.d3Force('link')?.distance(90)?.strength(0.25);
    Graph.d3VelocityDecay(0.5);
    Graph.d3AlphaDecay(0.025);
  }
  // Small graphs use default settings
}

/**
 * Temporarily boost simulation energy (e.g., after adding nodes).
 */
export function reheatSimulation(Graph, alpha = 0.3) {
  Graph.d3ReheatSimulation?.();
}

/**
 * Pause the force simulation.
 */
export function pauseSimulation(Graph) {
  Graph.pauseAnimation?.();
}

/**
 * Resume the force simulation.
 */
export function resumeSimulation(Graph) {
  Graph.resumeAnimation?.();
}
