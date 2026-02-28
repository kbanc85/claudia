import { Grid, Stars } from '@react-three/drei';
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Vector2 } from 'three';
import { getTheme } from '../lib/theme.js';

function mixHex(left, right, ratio = 0.5) {
  const parse = (value) => {
    const normalized = String(value || '#000000').replace('#', '');
    const full = normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized;
    const int = Number.parseInt(full, 16);
    return {
      r: (int >> 16) & 255,
      g: (int >> 8) & 255,
      b: int & 255
    };
  };

  const a = parse(left);
  const b = parse(right);
  const t = Math.max(0, Math.min(1, ratio));
  const toHex = (value) => value.toString(16).padStart(2, '0');
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bValue = Math.round(a.b + (b.b - a.b) * t);
  return `#${toHex(r)}${toHex(g)}${toHex(bValue)}`;
}

export function SceneFx({ themeId, sceneQuality, renderSettings, focusTarget, focusLocked = false }) {
  const theme = getTheme(themeId);
  const enableEffects = sceneQuality.effectsEnabled && sceneQuality.quality !== 'performance';
  const bloomStrength = Number(renderSettings.bloomStrength || 1);
  const chromaticStrength = Number(renderSettings.chromaticStrength || 1);
  const fogNearScale = Number(renderSettings.fogNear || 1);
  const fogFarScale = Number(renderSettings.fogFar || 1);
  const fogNear = 900 * fogNearScale;
  const fogFar = Math.max(fogNear + 1200, 4200 * fogFarScale);
  const gridOpacity = Number(renderSettings.gridOpacity || 0.34);
  const gridDensity = Number(renderSettings.gridDensity || 1.15);
  const cellSize = 32 / gridDensity;
  const sectionSize = 160 / gridDensity;
  const desaturatedGrid = mixHex(theme.scene.grid, theme.scene.fog, 0.7);
  const softSection = mixHex(theme.css['--border-strong'], theme.scene.fog, 0.58);
  const cellThickness = 0.34 + gridOpacity * 0.7;
  const sectionThickness = 0.8 + gridOpacity * 1.1;
  const gridKey = `${themeId}:${gridDensity.toFixed(2)}:${gridOpacity.toFixed(2)}`;
  const chromaticAttenuation = focusLocked ? 0.42 : 0.72;
  const dofTarget = focusTarget ? [focusTarget.x, focusTarget.y, focusTarget.z] : [0, 0, 0];
  const dofBokeh = focusLocked ? 0.46 : 0.18;
  const dofFocalLength = focusLocked ? 0.014 : 0.008;

  return (
    <>
      <color attach="background" args={[theme.scene.clear]} />
      <fog attach="fog" args={[theme.scene.fog, fogNear, fogFar]} />
      <ambientLight intensity={0.7} color={theme.scene.ambient} />
      <directionalLight position={[220, 190, 180]} intensity={1.3} color={theme.scene.key} />
      <directionalLight position={[-160, 110, -220]} intensity={0.65} color={theme.scene.rim} />
      <Grid
        key={gridKey}
        args={[1800, 1800]}
        position={[0, -180, 0]}
        cellColor={desaturatedGrid}
        sectionColor={softSection}
        cellThickness={cellThickness}
        sectionThickness={sectionThickness}
        fadeDistance={2600}
        fadeStrength={0.95 - Math.min(gridOpacity * 0.4, 0.28)}
        infiniteGrid
        cellSize={Math.max(10, cellSize)}
        sectionSize={Math.max(56, sectionSize)}
      />
      <Stars radius={880} depth={280} count={1700} factor={4} saturation={0} fade speed={0.4} />
      {enableEffects ? (
        <EffectComposer multisampling={sceneQuality.quality === 'quality' ? 8 : 4}>
          <DepthOfField
            target={dofTarget}
            focalLength={dofFocalLength}
            bokehScale={dofBokeh}
            focusRange={0.08}
            resolutionScale={1}
          />
          <Bloom intensity={theme.scene.bloom * bloomStrength} luminanceThreshold={0.28} luminanceSmoothing={0.2} />
          <ChromaticAberration
            blendFunction={BlendFunction.NORMAL}
            offset={new Vector2(
              theme.scene.chromatic * chromaticStrength * chromaticAttenuation,
              theme.scene.chromatic * 0.35 * chromaticStrength * chromaticAttenuation
            )}
          />
          <Noise opacity={0.03} />
          <Vignette eskil={false} offset={0.18} darkness={0.5} />
        </EffectComposer>
      ) : null}
    </>
  );
}
