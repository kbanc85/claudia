import { Html } from '@react-three/drei';
import { alpha } from '../lib/theme.js';

function visibleLabels(nodes, interactionContext, mode) {
  const filtered = nodes.filter((node) =>
    interactionContext.selectedNodeId === node.id
    || interactionContext.hoveredNodeId === node.id
    || interactionContext.traceNodes.has(node.id)
    || interactionContext.pinnedNodeIds.has(node.id)
  );

  const max = mode === 'dense' ? 24 : mode === 'minimal' ? 8 : 14;
  return filtered.slice(0, max);
}

export function LabelLayer({ nodes, positions, interactionContext, labelMode, labelScale = 1.15 }) {
  return visibleLabels(nodes, interactionContext, labelMode).map((node) => {
    if (node.kind === 'entity') return null;
    const position = positions[node.id];
    if (!position) return null;

    const style = {
      background: `linear-gradient(180deg, ${alpha(node.accent, 0.18)}, rgba(8, 13, 20, 0.9))`,
      borderColor: alpha(node.accent, 0.56),
      boxShadow: `0 8px 18px ${alpha(node.accent, 0.16)}`,
      fontSize: `${Math.round(13 * Number(labelScale || 1.15))}px`,
      padding: `${Math.round(7 * Number(labelScale || 1.15))}px ${Math.round(10 * Number(labelScale || 1.15))}px`,
      maxWidth: `${Math.round(320 * Number(labelScale || 1.15))}px`
    };

    return (
      <Html
        key={`label-${node.id}`}
        position={[position.x, position.y + node.size + 12, position.z]}
        transform
        sprite
        distanceFactor={26}
        className="graph-node-label-wrap"
        zIndexRange={[5, 0]}
        occlude
      >
        <div className="graph-node-label is-secondary" style={style} title={node.labelText}>{node.labelText}</div>
      </Html>
    );
  });
}
