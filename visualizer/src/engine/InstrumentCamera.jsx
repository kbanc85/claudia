import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3 } from 'three';

function boundsFor(nodeIds, positions) {
  const vectors = nodeIds
    .map((id) => positions[id])
    .filter(Boolean);

  if (!vectors.length) {
    return {
      center: new Vector3(0, 0, 0),
      radius: 260
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of vectors) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }

  const center = new Vector3(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2
  );
  const radius = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 280) * 0.9;
  return { center, radius };
}

export function InstrumentCamera({
  nodes,
  positions,
  rawPositions,
  traceNodeIds,
  cameraTarget,
  cameraMode,
  fitNonce,
  selectedNodeId,
  renderSettings
}) {
  const controlsRef = useRef(null);
  const desiredPosition = useRef(new Vector3(340, 180, 340));
  const desiredTarget = useRef(new Vector3(0, 0, 0));
  const hasFramed = useRef(false);
  const animationStrength = useRef(0);
  const lastFitNonce = useRef(fitNonce);
  const lastTraceSignature = useRef('');
  const lastCameraTarget = useRef(null);
  const userInteracting = useRef(false);
  const { camera } = useThree();

  const allNodeIds = useMemo(() => nodes.map((node) => node.id), [nodes]);

  const resolvedPositions = Object.keys(positions || {}).length ? positions : rawPositions || {};

  const setCameraFrame = (center, radius, mode = 'overview') => {
    const resolvedRadius = Math.max(120, radius);
    const vertical = mode === 'trace' ? 0.28 : mode === 'inspect' ? 0.22 : 0.38;
    const controlsTarget = controlsRef.current?.target || desiredTarget.current;
    const lookDirection = camera.position.clone().sub(controlsTarget);
    if (lookDirection.lengthSq() <= 0.0001) {
      lookDirection.set(1, vertical, 1);
    }
    lookDirection.normalize();

    desiredTarget.current.copy(center);
    desiredPosition.current.copy(center)
      .add(lookDirection.multiplyScalar(resolvedRadius * (mode === 'trace' ? 1.52 : 1.38)));
    desiredPosition.current.y += resolvedRadius * vertical;
    animationStrength.current = 1;
  };

  useEffect(() => {
    if (!nodes.length || hasFramed.current) return;
    hasFramed.current = true;
    const { center, radius } = boundsFor(allNodeIds, resolvedPositions);
    setCameraFrame(center, radius, 'overview');
  }, [allNodeIds, nodes.length, resolvedPositions]);

  useEffect(() => {
    if (fitNonce === lastFitNonce.current) return;
    lastFitNonce.current = fitNonce;
    const focusIds = cameraMode === 'trace' && traceNodeIds.length ? traceNodeIds : allNodeIds;
    const { center, radius } = boundsFor(focusIds, resolvedPositions);
    setCameraFrame(center, radius, cameraMode);
  }, [allNodeIds, cameraMode, fitNonce, resolvedPositions, traceNodeIds]);

  useEffect(() => {
    if (cameraMode !== 'trace' || !traceNodeIds.length) return;
    const signature = traceNodeIds.join('|');
    if (signature === lastTraceSignature.current) return;
    lastTraceSignature.current = signature;
    const { center, radius } = boundsFor(traceNodeIds, resolvedPositions);
    setCameraFrame(center, radius * 0.9, 'trace');
  }, [cameraMode, resolvedPositions, traceNodeIds]);

  useEffect(() => {
    if (!cameraTarget || !resolvedPositions[cameraTarget]) return;
    if (lastCameraTarget.current === `${cameraMode}:${cameraTarget}`) return;
    lastCameraTarget.current = `${cameraMode}:${cameraTarget}`;
    const point = resolvedPositions[cameraTarget];
    const center = new Vector3(point.x, point.y, point.z);
    const radius = cameraMode === 'trace' ? 170 : 128;
    setCameraFrame(center, radius, cameraMode === 'trace' ? 'trace' : 'inspect');
  }, [cameraMode, cameraTarget, resolvedPositions]);

  useFrame(() => {
    const moveSpeed = 0.1 * Number(renderSettings.cameraMoveSpeed || 1);
    if (!userInteracting.current && animationStrength.current > 0.002) {
      camera.position.lerp(desiredPosition.current, moveSpeed);
      animationStrength.current *= 0.9;
    }
    if (controlsRef.current) {
      if (!userInteracting.current && animationStrength.current > 0.002) {
        controlsRef.current.target.lerp(desiredTarget.current, Math.min(0.2, moveSpeed * 1.2));
      } else if (userInteracting.current) {
        desiredTarget.current.copy(controlsRef.current.target);
        desiredPosition.current.copy(camera.position);
      }
      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.72}
      zoomSpeed={0.8}
      panSpeed={0.6}
      autoRotate={Boolean(renderSettings.autoRotateEnabled) && (Boolean(selectedNodeId) || Boolean(renderSettings.autoRotateGlobal))}
      autoRotateSpeed={Number(renderSettings.autoRotateSpeed || 0.55)}
      minDistance={48}
      maxDistance={2400}
      onStart={() => {
        userInteracting.current = true;
        animationStrength.current = 0;
      }}
      onEnd={() => {
        userInteracting.current = false;
        desiredTarget.current.copy(controlsRef.current?.target || desiredTarget.current);
        desiredPosition.current.copy(camera.position);
      }}
    />
  );
}
