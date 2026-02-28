import { useMemo } from 'react';
import { alpha, formatDateShort, kindLabel, resultTone, titleCase, trunc } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

function FilterGroup({ title, items, group, onToggle }) {
  return (
    <section className="panel-block">
      <div className="panel-heading">
        <span>{title}</span>
      </div>
      <div className="filter-list">
        {Object.entries(items).map(([key, enabled]) => (
          <button
            key={key}
            className={`filter-pill ${enabled ? 'is-active' : ''}`}
            onClick={() => onToggle(group, key)}
          >
            {titleCase(key)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function LeftSidebar() {
  const stats = useGraphStore((state) => state.stats);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const searchResults = useGraphStore((state) => state.searchResults);
  const activeFilters = useGraphStore((state) => state.activeFilters);
  const commitmentFeed = useGraphStore((state) => state.commitmentFeed);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const selectNode = useGraphStore((state) => state.selectNode);
  const toggleFilter = useGraphStore((state) => state.toggleFilter);
  const resetFilters = useGraphStore((state) => state.resetFilters);
  const themeId = useGraphStore((state) => state.themeId);
  const renderSettings = useGraphStore((state) => state.renderSettings);
  const setRenderSetting = useGraphStore((state) => state.setRenderSetting);

  const quickResults = useMemo(() => searchResults.slice(0, 6), [searchResults]);

  return (
    <aside className="side-panel left-sidebar">
      <section className="panel-block">
        <div className="panel-heading">
          <span>Search</span>
          <strong>Browse memory</strong>
        </div>
        <input
          className="panel-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search entities, commitments, patterns..."
        />
        <div className="result-stack">
          {quickResults.length ? quickResults.map((result) => {
            const tone = resultTone(result, themeId, renderSettings);
            return (
              <button
                key={result.id}
                className="result-row result-toned"
                style={{
                  '--result-tone': tone,
                  '--result-tone-soft': alpha(tone, 0.14),
                  '--result-tone-border': alpha(tone, 0.42)
                }}
                onClick={() => selectNode(result.id)}
              >
                <span>{kindLabel(result.kind)} / {titleCase(result.subtype)}</span>
                <strong>{result.label}</strong>
                <span>{trunc(result.description, 84)}</span>
              </button>
            );
          }) : (
            <div className="empty-inline">Type to search the local graph.</div>
          )}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-heading">
          <span>Overview</span>
          <strong>Graph statistics</strong>
        </div>
        <div className="metric-grid">
          <div className="metric-card"><span>Entities</span><strong>{stats?.entities ?? 0}</strong></div>
          <div className="metric-card"><span>Memories</span><strong>{stats?.memories ?? 0}</strong></div>
          <div className="metric-card"><span>Links</span><strong>{stats?.relationships ?? 0}</strong></div>
          <div className="metric-card"><span>Patterns</span><strong>{stats?.patterns ?? 0}</strong></div>
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-heading">
          <span>Entity Breakdown</span>
          <strong>By subtype</strong>
        </div>
        <div className="breakdown-list">
          {(stats?.entityTypes || []).map((entry) => (
            <div key={entry.type} className="breakdown-row">
              <span>{titleCase(entry.type)}</span>
              <strong>{entry.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="panel-block">
        <div className="panel-heading">
          <span>Memory Layer</span>
          <strong>{renderSettings.showOverviewMemories ? 'Overview visible' : 'Overview hidden'}</strong>
        </div>
        <div className="inline-actions">
          <button
            className={`panel-button panel-button-wide ${renderSettings.showOverviewMemories ? 'is-active' : ''}`}
            onClick={() => setRenderSetting('showOverviewMemories', !renderSettings.showOverviewMemories)}
          >
            {renderSettings.showOverviewMemories ? 'Hide overview memories' : 'Show all memory types'}
          </button>
        </div>
        <div className="empty-inline">
          Toggle the full memory layer, then use the subtype pills below to hide individual kinds.
        </div>
      </section>

      <FilterGroup title="Entity Types" items={activeFilters.entities} group="entities" onToggle={toggleFilter} />
      <FilterGroup title="Memory Types" items={activeFilters.memories} group="memories" onToggle={toggleFilter} />
      <FilterGroup title="Pattern Types" items={activeFilters.patterns} group="patterns" onToggle={toggleFilter} />

      <section className="panel-block">
        <div className="panel-heading">
          <span>Filters</span>
          <strong>Reset visibility</strong>
        </div>
        <button className="panel-button panel-button-wide" onClick={resetFilters}>Reset Filters</button>
      </section>

      <section className="panel-block">
        <div className="panel-heading">
          <span>Commitments</span>
          <strong>Active feed</strong>
        </div>
        <div className="result-stack">
          {commitmentFeed.slice(0, 8).map((item) => (
            <button key={item.id} className="result-row commitment-row" onClick={() => selectNode(item.id)}>
              <span>{formatDateShort(item.timestamps?.deadlineAt || item.timestamps?.activityAt)}</span>
              <strong>{item.label}</strong>
              <span>{titleCase(item.status)}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
