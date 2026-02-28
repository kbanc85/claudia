import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { Color } from 'three';
import { alpha } from '../lib/theme.js';

function glyphFor(node) {
  if (node.kind === 'entity') {
    if (node.subtype === 'organization') return 'box';
    if (node.subtype === 'project') return 'octahedron';
    return 'sphere';
  }
  if (node.kind === 'pattern') return 'icosahedron';
  if (node.kind === 'commitment') return 'commitment';
  return 'memory';
}

function emphasis(node, interactionContext) {
  return interactionContext.selectedNodeId === node.id
    || interactionContext.hoveredNodeId === node.id
    || interactionContext.pinnedNodeIds.has(node.id)
    || interactionContext.traceNodes.has(node.id)
    || interactionContext.selectedNeighbors.has(node.id)
    || interactionContext.hoveredNeighbors.has(node.id);
}

function AnimatedNodeMotion({ groupRef, pulseRingRef, node, motionLevel }) {
  useFrame(({ clock }, delta) => {
    if (groupRef.current && motionLevel !== 'reduced') {
      groupRef.current.rotation.y += delta * (node.kind === 'pattern' ? 0.24 : 0.1);
    }

    if (pulseRingRef.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * (node.kind === 'commitment' ? 3.2 : 1.4)) * 0.08;
      pulseRingRef.current.scale.setScalar(pulse);
    }
  });

  return null;
}

function NodeGlyph({ node, position, interactionContext, renderSettings, onNodeSelect, onNodeHover }) {
  const groupRef = useRef(null);
  const pulseRingRef = useRef(null);
  const highlighted = emphasis(node, interactionContext);
  const selected = interactionContext.selectedNodeId === node.id;
  const hovered = interactionContext.hoveredNodeId === node.id;
  const traceNode = interactionContext.traceNodes.has(node.id);
  const pinned = interactionContext.pinnedNodeIds.has(node.id);
  const scale = node.size * (selected ? 1.16 : hovered ? 1.1 : traceNode ? 1.08 : 1);
  const opacityScale = Number(renderSettings.nodeOpacity || 1);
  const opacity = interactionContext.selectedNodeId || interactionContext.hoveredNodeId || interactionContext.graphMode === 'trace'
    ? (highlighted ? 1 : 0.18) * opacityScale
    : 1 * opacityScale;
  const accent = new Color(node.accent);
  const core = new Color(selected ? '#f5fbff' : node.color);
  const motionLevel = renderSettings.motionLevel || 'full';
  const memoryGlyph = renderSettings.memoryStyle === 'shard' ? 'shard' : 'orb';
  const commitmentGlyph = renderSettings.commitmentStyle === 'diamond' ? 'diamond' : 'beacon';
  const resolvedGlyph = useMemo(() => {
    const baseGlyph = glyphFor(node);
    if (baseGlyph === 'memory') return memoryGlyph;
    if (baseGlyph === 'commitment') return commitmentGlyph;
    return baseGlyph;
  }, [commitmentGlyph, memoryGlyph, node]);
  const labelStyle = {
    background: `linear-gradient(180deg, ${alpha(node.accent, 0.26)}, rgba(7, 12, 18, 0.92))`,
    borderColor: alpha(node.accent, 0.72),
    boxShadow: `0 10px 24px ${alpha(node.accent, 0.22)}`,
    fontSize: `${Math.round(15 * Number(renderSettings.labelScale || 1.15))}px`,
    padding: `${Math.round(8 * Number(renderSettings.labelScale || 1.15))}px ${Math.round(12 * Number(renderSettings.labelScale || 1.15))}px`,
    maxWidth: `${Math.round(360 * Number(renderSettings.labelScale || 1.15))}px`
  };
  const animateNode = selected
    || hovered
    || traceNode
    || pinned
    || node.kind === 'pattern'
    || resolvedGlyph === 'beacon'
    || resolvedGlyph === 'diamond';

  const eventFlags = (event) => ({
    shiftKey: Boolean(event.shiftKey || event.nativeEvent?.shiftKey)
  });

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y, position.z]}
      onPointerOver={(event) => {
        event.stopPropagation();
        onNodeHover(node.id);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        onNodeHover(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onNodeSelect(node.id, eventFlags(event));
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onNodeSelect(node.id, { ...eventFlags(event), doubleClick: true });
      }}
    >
      {animateNode ? (
        <AnimatedNodeMotion
          groupRef={groupRef}
          pulseRingRef={pulseRingRef}
          node={node}
          motionLevel={motionLevel}
        />
      ) : null}

      {resolvedGlyph === 'sphere' ? (
        <mesh scale={scale}>
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={selected ? 1.18 : traceNode ? 0.94 : 0.34} metalness={0.24} roughness={0.34} transparent opacity={Math.max(opacity, 0.28)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'box' ? (
        <mesh scale={[scale * 1.22, scale * 1.22, scale * 1.22]}>
          <boxGeometry args={[1.5, 1.5, 1.5]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={selected ? 1.12 : 0.32} metalness={0.26} roughness={0.3} transparent opacity={Math.max(opacity, 0.28)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'octahedron' ? (
        <mesh scale={scale * 1.2}>
          <octahedronGeometry args={[1.1]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={selected ? 1.1 : 0.32} metalness={0.22} roughness={0.28} transparent opacity={Math.max(opacity, 0.28)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'icosahedron' ? (
        <mesh scale={scale * 1.14}>
          <icosahedronGeometry args={[1.05, 0]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={traceNode ? 1.02 : 0.32} wireframe metalness={0.12} roughness={0.22} transparent opacity={Math.max(opacity, 0.28)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'orb' ? (
        <mesh scale={[scale * 0.9, scale * 1.14, scale * 0.9]}>
          <sphereGeometry args={[0.82, 18, 18]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={hovered ? 0.78 : 0.22} metalness={0.18} roughness={0.56} transparent opacity={Math.max(opacity * 0.96, 0.24)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'shard' ? (
        <mesh scale={[scale * 0.86, scale * 1.18, scale * 0.86]}>
          <octahedronGeometry args={[0.92]} />
          <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={hovered ? 0.82 : 0.26} metalness={0.2} roughness={0.44} transparent opacity={Math.max(opacity * 0.96, 0.24)} />
        </mesh>
      ) : null}

      {resolvedGlyph === 'beacon' ? (
        <>
          <mesh scale={[scale * 0.72, scale * 1.3, scale * 0.72]}>
            <cylinderGeometry args={[0.72, 0.95, 1.95, 6]} />
            <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={1.32} metalness={0.2} roughness={0.24} transparent opacity={Math.max(opacity, 0.32)} />
          </mesh>
          <mesh ref={pulseRingRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <torusGeometry args={[scale * 1.34, scale * 0.14, 10, 40]} />
            <meshBasicMaterial color={accent} transparent opacity={0.5 * opacity} />
          </mesh>
        </>
      ) : null}

      {resolvedGlyph === 'diamond' ? (
        <>
          <mesh scale={[scale * 0.92, scale * 1.28, scale * 0.92]}>
            <octahedronGeometry args={[1.05]} />
            <meshStandardMaterial color={core} emissive={accent} emissiveIntensity={1.22} metalness={0.24} roughness={0.22} transparent opacity={Math.max(opacity, 0.32)} />
          </mesh>
          <mesh ref={pulseRingRef} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
            <torusGeometry args={[scale * 1.2, scale * 0.11, 10, 40]} />
            <meshBasicMaterial color={accent} transparent opacity={0.45 * opacity} />
          </mesh>
        </>
      ) : null}

      {node.kind === 'entity' && (selected || hovered || traceNode || pinned) ? (
        <Html
          position={[0, scale + 14, 0]}
          transform
          sprite
          distanceFactor={28}
          className="graph-node-label-wrap"
          zIndexRange={[6, 0]}
          occlude
        >
          <div className="graph-node-label" style={labelStyle} title={node.labelText}>{node.labelText}</div>
        </Html>
      ) : null}
    </group>
  );
}

export function NodeGlyphs(props) {
  const { nodes, positions, interactionContext, renderSettings, onNodeSelect, onNodeHover } = props;
  return nodes.map((node) => {
    const position = positions[node.id] || { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
    return (
      <NodeGlyph
        key={node.id}
        node={node}
        position={position}
        interactionContext={interactionContext}
        renderSettings={renderSettings}
        onNodeSelect={onNodeSelect}
        onNodeHover={onNodeHover}
      />
    );
  });
}
