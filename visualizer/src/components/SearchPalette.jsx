import { useEffect, useRef } from 'react';
import { alpha, kindLabel, resultTone, titleCase, trunc } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

export function SearchPalette() {
  const inputRef = useRef(null);
  const searchOpen = useGraphStore((state) => state.searchOpen);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const searchResults = useGraphStore((state) => state.searchResults);
  const setSearchOpen = useGraphStore((state) => state.setSearchOpen);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const selectNode = useGraphStore((state) => state.selectNode);
  const themeId = useGraphStore((state) => state.themeId);
  const renderSettings = useGraphStore((state) => state.renderSettings);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [searchOpen]);

  if (!searchOpen) return null;

  return (
    <div className="overlay-backdrop" onClick={() => setSearchOpen(false)}>
      <div className="overlay-panel search-panel" onClick={(event) => event.stopPropagation()}>
        <div className="panel-heading">
          <span>Search Palette</span>
          <strong>Jump to graph nodes</strong>
        </div>
        <input
          ref={inputRef}
          className="panel-input panel-input-large"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search the local Claudia database"
        />
        <div className="result-stack">
          {searchResults.map((result) => {
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
                onClick={async () => {
                  await selectNode(result.id);
                  setSearchOpen(false);
                }}
              >
                <span>{kindLabel(result.kind)} / {titleCase(result.subtype)}</span>
                <strong>{result.label}</strong>
                <span>{trunc(result.description, 110)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
