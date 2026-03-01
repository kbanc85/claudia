import { useRef } from 'react';
import { APP_THEMES, getTheme } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

function Slider({ label, value, min, max, step = 0.05, onChange }) {
  return (
    <label className="settings-control settings-slider">
      <div className="slider-head">
        <span>{label}</span>
        <strong>{typeof value === 'number' ? value.toFixed(2) : value}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} />
    </label>
  );
}

function Toggle({ label, active, onClick }) {
  return (
    <button className={`filter-pill ${active ? 'is-active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="settings-color-field">
      <span>{label}</span>
      <div className="settings-color-input">
        <input type="color" value={value} onChange={onChange} />
        <code>{value}</code>
      </div>
    </label>
  );
}

function Group({ eyebrow, title, children }) {
  return (
    <section className="settings-section">
      <div className="panel-heading">
        <span>{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      <div className="settings-stack">
        {children}
      </div>
    </section>
  );
}

function Note({ children }) {
  return <div className="settings-note">{children}</div>;
}

export function SettingsContent() {
  const fileInputRef = useRef(null);
  const themeId = useGraphStore((state) => state.themeId);
  const theme = getTheme(themeId);
  const renderSettings = useGraphStore((state) => state.renderSettings);
  const sceneQuality = useGraphStore((state) => state.sceneQuality);
  const setRenderSetting = useGraphStore((state) => state.setRenderSetting);
  const setSceneEffectsEnabled = useGraphStore((state) => state.setSceneEffectsEnabled);
  const setSceneQualityMode = useGraphStore((state) => state.setSceneQualityMode);
  const resetRenderSettings = useGraphStore((state) => state.resetRenderSettings);
  const applySettingsPreset = useGraphStore((state) => state.applySettingsPreset);

  const exportSettings = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      themeId,
      renderSettings,
      sceneQuality
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `claudia-graph-settings-${themeId}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const importSettings = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const preset = JSON.parse(text);
      applySettingsPreset(preset);
    } catch {
      window.alert('Could not import settings file.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="settings-panel-inline">
      <div className="panel-heading">
        <span>Instrument Controls</span>
        <strong>Saved locally</strong>
      </div>

      <div className="inline-actions">
        <button className="panel-button" onClick={exportSettings}>Export settings</button>
        <button className="panel-button" onClick={() => fileInputRef.current?.click()}>Import settings</button>
        <button className="panel-button" onClick={resetRenderSettings}>Reset defaults</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="settings-file-input"
          onChange={importSettings}
        />
      </div>

      <Group eyebrow="Theme" title="Preset selection">
        <Note>Switch the full visual system here. Scene colors, node tones, grid, fog, and highlights update together.</Note>
        <label className="settings-control">
          <div className="slider-head">
            <span>Active theme</span>
            <strong>{APP_THEMES[themeId]?.label || themeId}</strong>
          </div>
          <select
            className="panel-input"
            value={themeId}
            onChange={(event) => applySettingsPreset({ themeId: event.target.value })}
          >
            {Object.values(APP_THEMES).map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.label}</option>
            ))}
          </select>
        </label>
        <label className="settings-control">
          <div className="slider-head">
            <span>Quality mode</span>
            <strong>{sceneQuality.quality}</strong>
          </div>
          <select className="panel-input" value={sceneQuality.quality} onChange={(event) => setSceneQualityMode(event.target.value)}>
            <option value="auto">Auto</option>
            <option value="quality">Quality</option>
            <option value="balanced">Balanced</option>
            <option value="performance">Performance</option>
          </select>
        </label>
      </Group>

      <Group eyebrow="Nodes" title="Hierarchy and readability">
        <Note>These control the scale balance between entities, memory nodes, and labels.</Note>
        <Slider label="Entity size" value={renderSettings.entitySize} min={0.55} max={1.9} onChange={(event) => setRenderSetting('entitySize', Number(event.target.value))} />
        <Slider label="Memory size" value={renderSettings.memorySize} min={0.45} max={1.5} onChange={(event) => setRenderSetting('memorySize', Number(event.target.value))} />
        <Slider label="Pattern size" value={renderSettings.patternSize} min={0.45} max={1.5} onChange={(event) => setRenderSetting('patternSize', Number(event.target.value))} />
        <Slider label="Node opacity" value={renderSettings.nodeOpacity} min={0.45} max={1.25} onChange={(event) => setRenderSetting('nodeOpacity', Number(event.target.value))} />
        <Slider label="Label scale" value={renderSettings.labelScale} min={0.9} max={1.8} onChange={(event) => setRenderSetting('labelScale', Number(event.target.value))} />
        <Slider label="Trace emphasis" value={renderSettings.traceEmphasis} min={1} max={2.4} onChange={(event) => setRenderSetting('traceEmphasis', Number(event.target.value))} />
        <div className="settings-row">
          <span className="hud-meta-label">Label Mode</span>
          <div className="filter-list compact-list compact-list-3">
            {['minimal', 'balanced', 'dense'].map((mode) => (
              <Toggle key={mode} label={mode} active={renderSettings.labelMode === mode} onClick={() => setRenderSetting('labelMode', mode)} />
            ))}
          </div>
        </div>
      </Group>

      <Group eyebrow="Lines" title="Connections and emphasis">
        <Note>Use these for relationship readability. Thickness affects rendering, while the family length controls reheat the layout to spread clusters differently.</Note>
        <Slider label="Line thickness" value={renderSettings.lineThickness} min={0.6} max={2.4} onChange={(event) => setRenderSetting('lineThickness', Number(event.target.value))} />
        <Slider label="Selected thickness" value={renderSettings.selectedLineThickness} min={1} max={3} onChange={(event) => setRenderSetting('selectedLineThickness', Number(event.target.value))} />
        <Slider label="Line opacity" value={renderSettings.edgeOpacity} min={0.35} max={1.35} onChange={(event) => setRenderSetting('edgeOpacity', Number(event.target.value))} />
        <Slider label="Curve amount" value={renderSettings.lineCurvature} min={0} max={1.8} onChange={(event) => setRenderSetting('lineCurvature', Number(event.target.value))} />
        <Slider label="Entry spread" value={renderSettings.lineEntrySpread} min={0} max={0.65} onChange={(event) => setRenderSetting('lineEntrySpread', Number(event.target.value))} />
        <Slider label="Line intensity" value={renderSettings.edgeIntensity} min={0.4} max={2.2} onChange={(event) => setRenderSetting('edgeIntensity', Number(event.target.value))} />
        <Slider label="Entity line length" value={renderSettings.relationshipLineLength} min={0.65} max={1.8} onChange={(event) => setRenderSetting('relationshipLineLength', Number(event.target.value))} />
        <Slider label="Memory line length" value={renderSettings.memoryLineLength} min={0.55} max={1.8} onChange={(event) => setRenderSetting('memoryLineLength', Number(event.target.value))} />
        <Slider label="Pattern line length" value={renderSettings.patternLineLength} min={0.55} max={2.1} onChange={(event) => setRenderSetting('patternLineLength', Number(event.target.value))} />
      </Group>

      <Group eyebrow="Environment" title="Fog and grid">
        <Note>These affect the floor reference plane and background atmosphere. Grid color, opacity, and density now remount live so the change is obvious immediately.</Note>
        <Slider label="Fog near" value={renderSettings.fogNear} min={0.35} max={1.8} onChange={(event) => setRenderSetting('fogNear', Number(event.target.value))} />
        <Slider label="Fog far" value={renderSettings.fogFar} min={0.5} max={2.4} onChange={(event) => setRenderSetting('fogFar', Number(event.target.value))} />
        <Slider label="Grid opacity" value={renderSettings.gridOpacity} min={0.08} max={0.8} onChange={(event) => setRenderSetting('gridOpacity', Number(event.target.value))} />
        <Slider label="Grid density" value={renderSettings.gridDensity} min={0.55} max={2.4} onChange={(event) => setRenderSetting('gridDensity', Number(event.target.value))} />
        <div className="settings-colors settings-colors-stack">
          <ColorField label="Grid color" value={renderSettings.gridColor || theme.scene.grid} onChange={(event) => setRenderSetting('gridColor', event.target.value)} />
        </div>
      </Group>

      <Group eyebrow="Camera" title="Focus and motion">
        <Note>Camera changes are live. Use low values for calmer orbit behavior.</Note>
        <Slider label="Camera speed" value={renderSettings.cameraMoveSpeed} min={0.5} max={1.8} onChange={(event) => setRenderSetting('cameraMoveSpeed', Number(event.target.value))} />
        <Slider label="Orbit speed" value={renderSettings.autoRotateSpeed} min={0.1} max={2} onChange={(event) => setRenderSetting('autoRotateSpeed', Number(event.target.value))} />
        <div className="settings-row">
          <span className="hud-meta-label">Motion</span>
          <div className="filter-list compact-list">
            {['full', 'restrained', 'reduced'].map((mode) => (
              <Toggle key={mode} label={mode} active={renderSettings.motionLevel === mode} onClick={() => setRenderSetting('motionLevel', mode)} />
            ))}
          </div>
        </div>
        <div className="settings-row">
          <span className="hud-meta-label">Orbit</span>
          <div className="filter-list compact-list">
            <Toggle label="Focus orbit" active={renderSettings.autoRotateEnabled} onClick={() => setRenderSetting('autoRotateEnabled', !renderSettings.autoRotateEnabled)} />
            <Toggle label="Global orbit" active={renderSettings.autoRotateGlobal} onClick={() => setRenderSetting('autoRotateGlobal', !renderSettings.autoRotateGlobal)} />
          </div>
        </div>
      </Group>

      <Group eyebrow="Post FX" title="Bloom, chromatic, particles">
        <Note>These are the cinematic accents. Particle colors are separate from node colors so you can tune the motion language without changing the graph families.</Note>
        <Slider label="Bloom" value={renderSettings.bloomStrength} min={0} max={2.2} onChange={(event) => setRenderSetting('bloomStrength', Number(event.target.value))} />
        <Slider label="Chromatic" value={renderSettings.chromaticStrength} min={0} max={2.2} onChange={(event) => setRenderSetting('chromaticStrength', Number(event.target.value))} />
        <Slider label="Particle speed" value={renderSettings.particleSpeed} min={0.2} max={2.4} onChange={(event) => setRenderSetting('particleSpeed', Number(event.target.value))} />
        <Slider label="Particle size" value={renderSettings.particleSize} min={0.4} max={2} onChange={(event) => setRenderSetting('particleSize', Number(event.target.value))} />
        <div className="settings-colors settings-colors-stack">
          <ColorField label="Entity particles" value={renderSettings.relationshipParticleColor || theme.colors.entity} onChange={(event) => setRenderSetting('relationshipParticleColor', event.target.value)} />
          <ColorField label="Memory particles" value={renderSettings.memoryParticleColor || theme.colors.memory} onChange={(event) => setRenderSetting('memoryParticleColor', event.target.value)} />
          <ColorField label="Pattern particles" value={renderSettings.patternParticleColor || theme.colors.pattern} onChange={(event) => setRenderSetting('patternParticleColor', event.target.value)} />
        </div>
        <div className="settings-row">
          <span className="hud-meta-label">Visibility</span>
          <div className="filter-list compact-list">
            <Toggle label="Overview memories" active={renderSettings.showOverviewMemories} onClick={() => setRenderSetting('showOverviewMemories', !renderSettings.showOverviewMemories)} />
            <Toggle label="Commitments" active={renderSettings.showCommitments} onClick={() => setRenderSetting('showCommitments', !renderSettings.showCommitments)} />
            <Toggle label="Patterns" active={renderSettings.showPatterns} onClick={() => setRenderSetting('showPatterns', !renderSettings.showPatterns)} />
            <Toggle label="Effects" active={sceneQuality.effectsEnabled} onClick={() => setSceneEffectsEnabled(!sceneQuality.effectsEnabled)} />
            <Toggle label="Particles" active={renderSettings.showParticles} onClick={() => setRenderSetting('showParticles', !renderSettings.showParticles)} />
          </div>
        </div>
      </Group>

      <Group eyebrow="Entity Colors" title="Subtype overrides">
        <Note>Override the default theme colors for the three primary entity classes.</Note>
        <div className="settings-colors settings-colors-stack">
          <ColorField label="People" value={renderSettings.personColor} onChange={(event) => setRenderSetting('personColor', event.target.value)} />
          <ColorField label="Organizations" value={renderSettings.organizationColor} onChange={(event) => setRenderSetting('organizationColor', event.target.value)} />
          <ColorField label="Projects" value={renderSettings.projectColor} onChange={(event) => setRenderSetting('projectColor', event.target.value)} />
        </div>
      </Group>

      <Group eyebrow="Memory Nodes" title="Memory and commitment design">
        <Note>These customize the secondary node families without changing the entity palette.</Note>
        <div className="settings-colors settings-colors-stack">
          <ColorField label="Memories" value={renderSettings.memoryColor} onChange={(event) => setRenderSetting('memoryColor', event.target.value)} />
          <ColorField label="Commitments" value={renderSettings.commitmentColor} onChange={(event) => setRenderSetting('commitmentColor', event.target.value)} />
        </div>
        <div className="settings-row">
          <span className="hud-meta-label">Memory shape</span>
          <div className="filter-list compact-list">
            <Toggle label="Orb" active={renderSettings.memoryStyle === 'orb'} onClick={() => setRenderSetting('memoryStyle', 'orb')} />
            <Toggle label="Shard" active={renderSettings.memoryStyle === 'shard'} onClick={() => setRenderSetting('memoryStyle', 'shard')} />
          </div>
        </div>
        <div className="settings-row">
          <span className="hud-meta-label">Commitment shape</span>
          <div className="filter-list compact-list">
            <Toggle label="Beacon" active={renderSettings.commitmentStyle === 'beacon'} onClick={() => setRenderSetting('commitmentStyle', 'beacon')} />
            <Toggle label="Diamond" active={renderSettings.commitmentStyle === 'diamond'} onClick={() => setRenderSetting('commitmentStyle', 'diamond')} />
          </div>
        </div>
      </Group>
    </div>
  );
}

export function SettingsPanel() {
  return null;
}
