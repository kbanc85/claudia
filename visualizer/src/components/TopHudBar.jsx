import { APP_THEMES } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';
import { DatabaseSwitcher } from './DatabaseSwitcher.jsx';

export function TopHudBar() {
  const stats = useGraphStore((state) => state.stats);
  const graphMode = useGraphStore((state) => state.graphMode);
  const traceGraph = useGraphStore((state) => state.traceGraph);
  const themeId = useGraphStore((state) => state.themeId);
  const loadingState = useGraphStore((state) => state.loadingState);
  const errorMessage = useGraphStore((state) => state.errorMessage);
  const setGraphMode = useGraphStore((state) => state.setGraphMode);
  const clearTrace = useGraphStore((state) => state.clearTrace);
  const requestFit = useGraphStore((state) => state.requestFit);
  const clearSelection = useGraphStore((state) => state.clearSelection);
  const setSearchOpen = useGraphStore((state) => state.setSearchOpen);
  const setSettingsOpen = useGraphStore((state) => state.setSettingsOpen);
  const setInspectorOpen = useGraphStore((state) => state.setInspectorOpen);
  const setTheme = useGraphStore((state) => state.setTheme);
  const leftPanelOpen = useGraphStore((state) => state.leftPanelOpen);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const bottomPanelOpen = useGraphStore((state) => state.bottomPanelOpen);
  const toggleLeftPanel = useGraphStore((state) => state.toggleLeftPanel);
  const toggleRightPanel = useGraphStore((state) => state.toggleRightPanel);
  const toggleBottomPanel = useGraphStore((state) => state.toggleBottomPanel);

  const activeLoading = Object.values(loadingState).some(Boolean);

  return (
    <header className="top-hud">
      <div className="hud-brand">
        <img src="/claudia-logo.png" alt="Claudia" className="hud-logo" />
        <div className="hud-brand-copy">
          <strong>Claudia Brain</strong>
          <span>3D knowledge instrument</span>
        </div>
        <DatabaseSwitcher />
      </div>

      <div className="hud-mode-strip">
        <button
          className={`hud-chip ${graphMode === 'overview' ? 'is-active' : ''}`}
          onClick={() => {
            clearTrace();
            setGraphMode('overview');
          }}
        >
          Overview
        </button>
        <button
          className={`hud-chip ${graphMode === 'neighborhood' || graphMode === 'evidence' ? 'is-active' : ''}`}
          onClick={() => setGraphMode('neighborhood')}
        >
          Inspect
        </button>
        <button
          className={`hud-chip ${graphMode === 'trace' ? 'is-active' : ''}`}
          onClick={() => {
            if (traceGraph) setGraphMode('trace');
          }}
          disabled={!traceGraph}
        >
          Trace
        </button>
      </div>

      <div className="hud-stats">
        <div className="hud-stat">
          <span>Entities</span>
          <strong>{stats?.entities ?? 0}</strong>
        </div>
        <div className="hud-stat">
          <span>Memories</span>
          <strong>{stats?.memories ?? 0}</strong>
        </div>
        <div className="hud-stat">
          <span>Patterns</span>
          <strong>{stats?.patterns ?? 0}</strong>
        </div>
        <div className="hud-stat hud-stat-optional">
          <span>Links</span>
          <strong>{stats?.relationships ?? 0}</strong>
        </div>
      </div>

      <div className="hud-actions">
        <label className="hud-theme">
          <span className="hud-meta-label">Theme</span>
          <select
            className="hud-select"
            value={themeId}
            onChange={(event) => setTheme(event.target.value)}
          >
            {Object.values(APP_THEMES).map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </label>
        <button className={`hud-button ${leftPanelOpen ? 'is-active' : ''}`} onClick={toggleLeftPanel}>Left</button>
        <button className={`hud-button ${inspectorOpen ? 'is-active' : ''}`} onClick={toggleRightPanel}>Right</button>
        <button className={`hud-button ${bottomPanelOpen ? 'is-active' : ''}`} onClick={toggleBottomPanel}>Bottom</button>
        <button className="hud-button" onClick={() => setSearchOpen(true)}>Search</button>
        <button className="hud-button" onClick={requestFit}>Fit</button>
        <button className="hud-button" onClick={clearSelection}>Clear</button>
        <button className="hud-button" onClick={() => {
          setInspectorOpen(true);
          setSettingsOpen(true);
        }}>Settings</button>
        <div className={`hud-status ${errorMessage ? 'is-error' : activeLoading ? 'is-loading' : ''}`}>
          {errorMessage || (activeLoading ? 'Syncing' : 'Live')}
        </div>
      </div>
    </header>
  );
}
