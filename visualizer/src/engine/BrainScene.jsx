import { Canvas } from '@react-three/fiber';
import { useMemo } from 'react';
import { EdgeLayer } from './EdgeLayer.jsx';
import { InstrumentCamera } from './InstrumentCamera.jsx';
import { LabelLayer } from './LabelLayer.jsx';
import { NodeGlyphs } from './NodeGlyphs.jsx';
import { SceneFx } from './SceneFx.jsx';
import { useGraphLayout } from './useGraphLayout.js';

function centerFor(nodeIds, positions) {
  const resolved = nodeIds.map((id) => positions[id]).filter(Boolean);
  if (!resolved.length) return { x: 0, y: 0, z: 0 };

  const totals = resolved.reduce((acc, point) => ({
    x: acc.x + point.x,
    y: acc.y + point.y,
    z: acc.z + point.z
  }), { x: 0, y: 0, z: 0 });

  return {
    x: totals.x / resolved.length,
    y: totals.y / resolved.length,
    z: totals.z / resolved.length
  };
}

export function BrainScene({
  graph,
  interactionContext,
  themeId,
  renderSettings,
  sceneQuality,
  reheatToken,
  cameraTarget,
  cameraMode,
  fitNonce,
  selectedNodeId,
  onNodeSelect,
  onNodeHover,
  onBackgroundClick
}) {
  const { positions, rawPositions } = useGraphLayout(graph, reheatToken, renderSettings);
  const qualityMode = sceneQuality?.quality || 'balanced';
  const qualityDpr = qualityMode === 'quality'
    ? [1, 1.75]
    : qualityMode === 'performance'
      ? [1, 1.2]
      : [1, 1.45];
  const antialias = qualityMode !== 'performance';

  const traceNodeIds = useMemo(() => [...interactionContext.traceNodes], [interactionContext.traceNodes]);
  const focusTarget = useMemo(() => {
    if (cameraTarget && positions[cameraTarget]) return positions[cameraTarget];
    if (selectedNodeId && positions[selectedNodeId]) return positions[selectedNodeId];
    if (traceNodeIds.length) return centerFor(traceNodeIds, positions);
    return centerFor(graph.nodes.map((node) => node.id), positions);
  }, [cameraTarget, graph.nodes, positions, selectedNodeId, traceNodeIds]);
  const focusLocked = Boolean(cameraTarget || selectedNodeId || traceNodeIds.length);

  return (
    <Canvas
      className="graph-canvas"
      gl={{ antialias, alpha: true, powerPreference: 'high-performance' }}
      dpr={qualityDpr}
      camera={{ position: [340, 180, 340], fov: 42, near: 1, far: 5600 }}
      onPointerMissed={onBackgroundClick}
    >
      <SceneFx
        themeId={themeId}
        sceneQuality={sceneQuality}
        renderSettings={renderSettings}
        focusTarget={focusTarget}
        focusLocked={focusLocked}
      />
      <EdgeLayer edges={graph.edges} positions={positions} interactionContext={interactionContext} renderSettings={renderSettings} />
      <NodeGlyphs
        nodes={graph.nodes}
        positions={positions}
        interactionContext={interactionContext}
        renderSettings={renderSettings}
        onNodeSelect={onNodeSelect}
        onNodeHover={onNodeHover}
      />
      <LabelLayer
        nodes={graph.nodes}
        positions={positions}
        interactionContext={interactionContext}
        labelMode={renderSettings.labelMode}
        labelScale={renderSettings.labelScale}
      />
      <InstrumentCamera
        nodes={graph.nodes}
        positions={positions}
        rawPositions={rawPositions}
        traceNodeIds={traceNodeIds}
        cameraTarget={cameraTarget}
        cameraMode={cameraMode}
        fitNonce={fitNonce}
        selectedNodeId={selectedNodeId}
        renderSettings={renderSettings}
      />
    </Canvas>
  );
}
