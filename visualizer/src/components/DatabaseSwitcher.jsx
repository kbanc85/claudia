import { useMemo } from 'react';
import { useGraphStore } from '../store/useGraphStore.js';

function basename(value) {
  return String(value || '').split('/').filter(Boolean).pop() || 'Default';
}

export function DatabaseSwitcher() {
  const databases = useGraphStore((state) => state.databases);
  const activeDatabasePath = useGraphStore((state) => state.activeDatabasePath);
  const switchDatabase = useGraphStore((state) => state.switchDatabase);
  const loading = useGraphStore((state) => state.loadingState.database);

  const options = useMemo(() => (databases || []).map((entry) => ({
    path: entry.path,
    label: entry.name || basename(entry.path)
  })), [databases]);

  return (
    <label className="hud-db-switch">
      <span className="hud-meta-label">Database</span>
      <select
        className="hud-select"
        value={activeDatabasePath || ''}
        onChange={(event) => switchDatabase(event.target.value)}
        disabled={loading}
      >
        {options.map((entry) => (
          <option key={entry.path} value={entry.path}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  );
}
