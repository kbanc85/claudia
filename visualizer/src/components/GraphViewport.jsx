import { useEffect, useMemo } from 'react';
import { BrainScene } from '../engine/BrainScene.jsx';
import {
  buildInteractionContext,
  buildVisibleGraphData,
  mergeGraphData
} from '../lib/graphAdapters.js';
import { formatRelative, scorePercent, titleCase } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

function previewBody(node) {
  const text = String(node?.description || '').trim();
  if (text) return text;
  return 'No additional note stored.';
}

export function GraphViewport({ onTimelineRange }) {
  const overviewGraph = useGraphStore((state) => state.overviewGraph);
  const neighborhoodGraph = useGraphStore((state) => state.neighborhoodGraph);
  const traceGraph = useGraphStore((state) => state.traceGraph);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const hoveredNodeId = useGraphStore((state) => state.hoveredNodeId);
  const pinnedNodeIds = useGraphStore((state) => state.pinnedNodeIds);
  const activeFilters = useGraphStore((state) => state.activeFilters);
  const renderSettings = useGraphStore((state) => state.renderSettings);
  const graphMode = useGraphStore((state) => state.graphMode);
  const tracePath = useGraphStore((state) => state.tracePath);
  const traceEndpoints = useGraphStore((state) => state.traceEndpoints);
  const cameraTarget = useGraphStore((state) => state.cameraTarget);
  const cameraState = useGraphStore((state) => state.cameraState);
  const fitNonce = useGraphStore((state) => state.fitNonce);
  const timelineWindow = useGraphStore((state) => state.timelineWindow);
  const themeId = useGraphStore((state) => state.themeId);
  const sceneQuality = useGraphStore((state) => state.sceneQuality);
  const reheatToken = useGraphStore((state) => state.layoutState.reheatToken);
  const selectNode = useGraphStore((state) => state.selectNode);
  const setHoveredNode = useGraphStore((state) => state.setHoveredNode);
  const clearSelection = useGraphStore((state) => state.clearSelection);

  const activeGraph = useMemo(() => {
    if (graphMode === 'trace' && traceGraph) return mergeGraphData(overviewGraph, traceGraph);
    if ((graphMode === 'neighborhood' || graphMode === 'evidence') && neighborhoodGraph) {
      return mergeGraphData(overviewGraph, neighborhoodGraph);
    }
    return overviewGraph;
  }, [graphMode, neighborhoodGraph, overviewGraph, traceGraph]);

  const visibleGraph = useMemo(() => buildVisibleGraphData(activeGraph, {
    activeFilters,
    renderSettings,
    selectedNodeId,
    hoveredNodeId,
    pinnedNodeIds,
    traceEndpoints,
    timelineWindow,
    graphMode
  }, themeId), [
    activeFilters,
    activeGraph,
    graphMode,
    hoveredNodeId,
    pinnedNodeIds,
    renderSettings,
    selectedNodeId,
    themeId,
    timelineWindow,
    traceEndpoints
  ]);

  const interactionContext = useMemo(() => buildInteractionContext(visibleGraph, {
    selectedNodeId,
    hoveredNodeId,
    pinnedNodeIds,
    graphMode,
    tracePath,
    renderSettings
  }), [
    graphMode,
    hoveredNodeId,
    pinnedNodeIds,
    renderSettings,
    selectedNodeId,
    tracePath,
    visibleGraph
  ]);

  const previewNode = hoveredNodeId
    ? visibleGraph.nodeMap.get(hoveredNodeId) || null
    : selectedNodeId
      ? visibleGraph.nodeMap.get(selectedNodeId) || null
      : null;

  useEffect(() => {
    onTimelineRange?.(visibleGraph.timelineRange);
  }, [onTimelineRange, visibleGraph.timelineRange]);

  return (
    <section className="graph-viewport">
      <BrainScene
        graph={visibleGraph}
        interactionContext={interactionContext}
        themeId={themeId}
        renderSettings={renderSettings}
        sceneQuality={sceneQuality}
        reheatToken={reheatToken}
        cameraTarget={cameraTarget}
        cameraMode={cameraState.mode}
        fitNonce={fitNonce}
        selectedNodeId={selectedNodeId}
        onNodeSelect={selectNode}
        onNodeHover={setHoveredNode}
        onBackgroundClick={clearSelection}
      />

      <div className="viewport-overlay viewport-overlay-top">
        <span>Mode {titleCase(graphMode)}</span>
        <strong>{visibleGraph.counts.totalNodes} nodes / {visibleGraph.counts.totalEdges} links</strong>
      </div>

      <div className="viewport-overlay viewport-overlay-right">
        <span>Shift-click two entities to trace</span>
      </div>

      {previewNode ? (
        <div className="hover-panel">
          <span>{titleCase(previewNode.kind)} / {titleCase(previewNode.subtype)}</span>
          <strong>{previewNode.label}</strong>
          <div className="hover-panel-body">{previewBody(previewNode)}</div>
          <div className="hover-metrics">
            <span>Signal {scorePercent(previewNode.signalScore)}</span>
            <span>{formatRelative(previewNode.timestamps?.deadlineAt || previewNode.timestamps?.activityAt)}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
