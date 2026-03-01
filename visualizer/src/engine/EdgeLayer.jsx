import { Line, Sphere } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CubicBezierCurve3, Vector3 } from 'three';

function stableHash(value) {
  let hash = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function radialBasis(direction, seed) {
  const forward = direction.clone().normalize();
  const up = Math.abs(forward.y) > 0.92 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const tangent = new Vector3().crossVectors(forward, up).normalize();
  const bitangent = new Vector3().crossVectors(forward, tangent).normalize();
  const angle = ((stableHash(seed) % 360) * Math.PI) / 180;
  return tangent.multiplyScalar(Math.cos(angle)).add(bitangent.multiplyScalar(Math.sin(angle))).normalize();
}

function bendNormal(start, end, seed) {
  const direction = end.clone().sub(start).normalize();
  const bend = radialBasis(direction, `${seed}:bend`);
  const sign = stableHash(seed) % 2 === 0 ? 1 : -1;
  return bend.multiplyScalar(sign || 1);
}

function anchoredEndpoints(edge, positions) {
  const source = positions[edge.source];
  const target = positions[edge.target];
  if (!source || !target) return null;

  const sourceCenter = new Vector3(source.x, source.y, source.z);
  const targetCenter = new Vector3(target.x, target.y, target.z);
  const direction = targetCenter.clone().sub(sourceCenter);
  const span = direction.length();
  if (span <= 0.001) return null;

  direction.normalize();
  const sourceRadius = Math.max(3.2, Number(edge.sourceNode?.size || 0) * 0.92);
  const targetRadius = Math.max(3.2, Number(edge.targetNode?.size || 0) * 0.92);
  const entrySpread = Math.max(0, Math.min(0.68, Number(edge.renderSettings?.lineEntrySpread ?? 0.42)));
  const sourceOrbit = radialBasis(direction, `${edge.id}:source`);
  const targetOrbit = radialBasis(direction.clone().negate(), `${edge.id}:target`);
  const start = sourceCenter.clone()
    .add(direction.clone().multiplyScalar(sourceRadius * (1 - entrySpread * 0.18)))
    .add(sourceOrbit.multiplyScalar(sourceRadius * entrySpread));
  const end = targetCenter.clone()
    .add(direction.clone().multiplyScalar(-targetRadius * (1 - entrySpread * 0.18)))
    .add(targetOrbit.multiplyScalar(targetRadius * entrySpread));

  if (start.distanceTo(end) <= 0.001) return null;
  return { start, end };
}

function buildCurve(edge, positions, renderSettings) {
  const endpoints = anchoredEndpoints({ ...edge, renderSettings }, positions);
  if (!endpoints) return null;

  const { start, end } = endpoints;
  const span = start.distanceTo(end);
  const bend = bendNormal(start, end, edge.id);
  const curveStrength = Number(renderSettings.lineCurvature || 1);
  const sourceSkew = radialBasis(end.clone().sub(start).normalize(), `${edge.id}:source-skew`);
  const targetSkew = radialBasis(start.clone().sub(end).normalize(), `${edge.id}:target-skew`);
  const lift = (edge.channel === 'relationship' ? 0.16 : edge.channel === 'trace' ? 0.22 : edge.lineFamily === 'pattern' ? 0.15 : 0.11) * span * curveStrength;

  const controlA = start.clone()
    .lerp(end, 0.26)
    .add(bend.clone().multiplyScalar(lift))
    .add(sourceSkew.clone().multiplyScalar(lift * 0.18))
    .add(new Vector3(0, lift * 0.22, 0));
  const controlB = start.clone()
    .lerp(end, 0.74)
    .add(bend.clone().multiplyScalar(lift))
    .add(targetSkew.clone().multiplyScalar(lift * 0.18))
    .add(new Vector3(0, lift * 0.22, 0));

  const curve = new CubicBezierCurve3(start, controlA, controlB, end);
  const baseSegments = edge.channel === 'trace' ? 56 : edge.channel === 'relationship' ? 42 : edge.lineFamily === 'pattern' ? 34 : 28;
  const segmentCount = Math.max(baseSegments, Math.min(72, Math.round(span / 7.5)));
  const points = curve.getSpacedPoints(segmentCount).map((point) => [point.x, point.y, point.z]);
  return { curve, points };
}

function edgeHighlighted(edge, interactionContext) {
  return interactionContext.traceEdges.has(edge.id)
    || edge.source === interactionContext.selectedNodeId
    || edge.target === interactionContext.selectedNodeId
    || edge.source === interactionContext.hoveredNodeId
    || edge.target === interactionContext.hoveredNodeId;
}

function edgeOpacity(edge, interactionContext, renderSettings) {
  const highlighted = edgeHighlighted(edge, interactionContext);
  const opacityScale = Number(renderSettings.edgeOpacity || 1);

  if ((interactionContext.selectedNodeId || interactionContext.hoveredNodeId || interactionContext.graphMode === 'trace') && !highlighted) {
    return (edge.channel === 'relationship' ? 0.14 : 0.08) * opacityScale;
  }

  const base = edge.channel === 'trace'
    ? 0.98
    : edge.channel === 'relationship'
      ? 0.72
      : edge.channel === 'commitment'
        ? 0.62
        : 0.28;

  return base * opacityScale;
}

function particleColor(edge, renderSettings) {
  if (edge.channel === 'trace') return edge.color;
  if (edge.lineFamily === 'pattern') return renderSettings.patternParticleColor || edge.targetNode?.accent || edge.color;
  if (edge.lineFamily === 'memory') return renderSettings.memoryParticleColor || edge.targetNode?.accent || edge.color;
  return renderSettings.relationshipParticleColor || edge.sourceNode?.accent || edge.color;
}

function EdgeParticle({ edge, curve, highlighted, renderSettings }) {
  const particleRef = useRef(null);
  const offset = useMemo(() => (stableHash(edge.id) % 1000) / 1000, [edge.id]);

  useFrame(({ clock }) => {
    if (!particleRef.current) return;
    const speedBase = edge.channel === 'trace' ? 0.12 : edge.channel === 'relationship' ? 0.07 : 0.05;
    const speed = speedBase * Number(renderSettings.particleSpeed || 1);
    const t = (clock.elapsedTime * speed + offset) % 1;
    const point = curve.getPointAt(t);
    particleRef.current.position.copy(point);
  });

  const radius = 1.4 * Number(renderSettings.particleSize || 1) * (highlighted ? 1.16 : 1);
  return (
    <Sphere ref={particleRef} args={[radius, 10, 10]}>
      <meshBasicMaterial color={particleColor(edge, renderSettings)} transparent opacity={highlighted ? 0.88 : 0.58} />
    </Sphere>
  );
}

function EdgeCurve({ edge, positions, interactionContext, renderSettings, allowParticles }) {
  const built = useMemo(() => buildCurve(edge, positions, renderSettings), [edge, positions, renderSettings]);
  if (!built) return null;

  const { curve, points } = built;
  const highlighted = edgeHighlighted(edge, interactionContext);
  const highlightScale = highlighted ? Number(renderSettings.selectedLineThickness || 1.65) : 1;
  const baseWidth = edge.channel === 'relationship' ? 0.8 : edge.channel === 'trace' ? 0.62 : 0.42;

  return (
    <group>
      <Line
        points={points}
        color={edge.color}
        lineWidth={Math.max(baseWidth, edge.size * (edge.channel === 'relationship' ? 0.12 : edge.channel === 'trace' ? 0.14 : 0.08)) * highlightScale}
        transparent
        opacity={edgeOpacity(edge, interactionContext, renderSettings)}
        dashed={edge.channel === 'trace'}
        dashScale={12}
        dashSize={1.2}
        gapSize={0.8}
        worldUnits
      />
      {allowParticles && renderSettings.showParticles && (edge.channel === 'relationship' || edge.channel === 'trace' || edge.channel === 'commitment') ? (
        <EdgeParticle edge={edge} curve={curve} highlighted={highlighted} renderSettings={renderSettings} />
      ) : null}
    </group>
  );
}

export function EdgeLayer({ edges, positions, interactionContext, renderSettings }) {
  const denseGraph = edges.length > 280;
  return edges.map((edge) => (
    <EdgeCurve
      key={edge.id}
      edge={edge}
      positions={positions}
      interactionContext={interactionContext}
      renderSettings={renderSettings}
      allowParticles={!denseGraph || edgeHighlighted(edge, interactionContext) || edge.channel === 'trace'}
    />
  ));
}
