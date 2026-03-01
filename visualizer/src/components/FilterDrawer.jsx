import { useGraphStore } from '../store/useGraphStore.js';
import { ENTITY_SUBTYPES, MEMORY_SUBTYPES, PATTERN_SUBTYPES, titleCase } from '../lib/theme.js';

function FilterGroup({ title, group, values }) {
  const filters = useGraphStore((state) => state.activeFilters[group]);
  const toggleFilter = useGraphStore((state) => state.toggleFilter);

  return (
    <section className="drawer-section">
      <div className="section-head">
        <h3>{title}</h3>
      </div>
      <div className="toggle-grid">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            className={`toggle-chip ${filters[value] ? 'is-active' : ''}`}
            onClick={() => toggleFilter(group, value)}
          >
            {titleCase(value)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function FilterDrawer() {
  const filtersOpen = useGraphStore((state) => state.filtersOpen);
  const setFiltersOpen = useGraphStore((state) => state.setFiltersOpen);
  const resetFilters = useGraphStore((state) => state.resetFilters);

  if (!filtersOpen) return null;

  return (
    <div className="drawer-backdrop" onClick={() => setFiltersOpen(false)}>
      <aside className="drawer-shell" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div className="section-label">Filter Matrix</div>
            <h2>Subtype visibility</h2>
          </div>
          <div className="inline-actions">
            <button type="button" className="command-button" onClick={resetFilters}>Reset</button>
            <button type="button" className="command-button" onClick={() => setFiltersOpen(false)}>Close</button>
          </div>
        </div>
        <FilterGroup title="Entities" group="entities" values={ENTITY_SUBTYPES} />
        <FilterGroup title="Memories" group="memories" values={MEMORY_SUBTYPES} />
        <FilterGroup title="Patterns" group="patterns" values={PATTERN_SUBTYPES} />
      </aside>
    </div>
  );
}

