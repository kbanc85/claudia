import { useEffect, useMemo, useRef, useState } from 'react';
import { useGraphStore } from '../store/useGraphStore.js';

function seedPositions(nodes) {
  return Object.fromEntries((nodes || []).map((node) => [
    node.id,
    {
      x: Number(node.layout?.seedX ?? node.x ?? 0),
      y: Number(node.layout?.seedY ?? node.y ?? 0),
      z: Number(node.layout?.seedZ ?? node.z ?? 0)
    }
  ]));
}

export function useGraphLayout(graph, reheatToken, renderSettings) {
  const workerRef = useRef(null);
  const activeJobRef = useRef(0);
  const rawPositionsRef = useRef({});
  const displayPositionsRef = useRef({});
  const setLayoutSnapshot = useGraphStore((state) => state.setLayoutSnapshot);
  const previousPositions = useGraphStore((state) => state.layoutState.positions);
  const structureKey = useMemo(() => JSON.stringify({
    nodes: graph.nodes.map((node) => [
      node.id,
      node.layout?.seedX ?? node.x ?? 0,
      node.layout?.seedY ?? node.y ?? 0,
      node.layout?.seedZ ?? node.z ?? 0
    ]),
    edges: graph.edges.map((edge) => [edge.id, edge.source, edge.target, edge.channel, edge.lineFamily])
  }), [graph.edges, graph.nodes]);
  const initialPositions = useMemo(() => seedPositions(graph.nodes), [structureKey]);
  const [positions, setPositions] = useState(initialPositions);
  const [displayPositions, setDisplayPositions] = useState(initialPositions);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    setPositions(initialPositions);
    setDisplayPositions(initialPositions);
    rawPositionsRef.current = initialPositions;
    displayPositionsRef.current = initialPositions;
    setLayoutReady(false);
  }, [initialPositions]);

  useEffect(() => {
    rawPositionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    const worker = new Worker(new URL('./layoutWorker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, jobId, positions: nextPositions, velocities, done } = event.data || {};
      if (type !== 'snapshot' || jobId !== activeJobRef.current) return;
      setPositions(nextPositions || {});
      setLayoutSnapshot(nextPositions || {}, velocities || {}, false);
      if (done) setLayoutReady(true);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setLayoutSnapshot]);

  useEffect(() => {
    if (!workerRef.current) return;
    const jobId = activeJobRef.current + 1;
    activeJobRef.current = jobId;

    workerRef.current.postMessage({
      type: 'layout',
      jobId,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        subtype: node.subtype,
        anchorRef: node.anchorRef,
        clusterKey: node.clusterKey,
        size: node.size,
        layout: node.layout,
        importance: node.importance
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        strength: edge.strength,
        channel: edge.channel,
        lineFamily: edge.lineFamily,
        status: edge.status
      })),
      previousPositions,
      motionLevel: renderSettings.motionLevel,
      lineLengths: {
        entity: Number(renderSettings.relationshipLineLength || 1),
        memory: Number(renderSettings.memoryLineLength || 1),
        pattern: Number(renderSettings.patternLineLength || 1)
      },
      reheatToken
    });
  }, [
    previousPositions,
    reheatToken,
    renderSettings.memoryLineLength,
    renderSettings.motionLevel,
    renderSettings.patternLineLength,
    renderSettings.relationshipLineLength,
    structureKey
  ]);

  useEffect(() => {
    const smoothing = renderSettings.motionLevel === 'reduced'
      ? 0.34
      : renderSettings.motionLevel === 'restrained'
        ? 0.22
        : 0.16;
    let frameId = 0;
    let cancelled = false;

    const step = () => {
      if (cancelled) return;

      const targetPositions = rawPositionsRef.current || {};
      const currentPositions = displayPositionsRef.current || {};
      const targetIds = Object.keys(targetPositions);
      const nextPositions = {};
      let changed = targetIds.length !== Object.keys(currentPositions).length;
      let moving = false;

      for (const id of targetIds) {
        const target = targetPositions[id];
        const current = currentPositions[id] || target;
        const dx = target.x - current.x;
        const dy = target.y - current.y;
        const dz = target.z - current.z;
        const delta = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));

        if (delta <= 0.02) {
          nextPositions[id] = target;
          if (current !== target) changed = true;
          continue;
        }

        moving = true;
        changed = true;
        nextPositions[id] = {
          x: current.x + dx * smoothing,
          y: current.y + dy * smoothing,
          z: current.z + dz * smoothing
        };
      }

      if (changed) {
        displayPositionsRef.current = nextPositions;
        setDisplayPositions(nextPositions);
      }

      if (moving) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    frameId = window.requestAnimationFrame(step);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [positions, renderSettings.motionLevel]);

  return {
    positions: displayPositions,
    rawPositions: positions,
    layoutReady
  };
}
