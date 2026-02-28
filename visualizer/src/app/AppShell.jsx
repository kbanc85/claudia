import { useEffect, useState } from 'react';
import { BottomTimeline } from '../components/BottomTimeline.jsx';
import { GraphViewport } from '../components/GraphViewport.jsx';
import { LeftSidebar } from '../components/LeftSidebar.jsx';
import { RightInspector } from '../components/RightInspector.jsx';
import { SearchPalette } from '../components/SearchPalette.jsx';
import { TopHudBar } from '../components/TopHudBar.jsx';
import { applyThemeToDocument } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

export function AppShell() {
  const [timelineRange, setTimelineRange] = useState({ min: null, max: null });
  const init = useGraphStore((state) => state.init);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const runSearch = useGraphStore((state) => state.runSearch);
  const setSearchOpen = useGraphStore((state) => state.setSearchOpen);
  const setSettingsOpen = useGraphStore((state) => state.setSettingsOpen);
  const themeId = useGraphStore((state) => state.themeId);
  const leftPanelOpen = useGraphStore((state) => state.leftPanelOpen);
  const inspectorOpen = useGraphStore((state) => state.inspectorOpen);
  const bottomPanelOpen = useGraphStore((state) => state.bottomPanelOpen);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runSearch(searchQuery);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [runSearch, searchQuery]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === ',') {
        event.preventDefault();
        setSettingsOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSearchOpen, setSettingsOpen]);

  useEffect(() => {
    applyThemeToDocument(themeId);
  }, [themeId]);

  return (
    <div className={`app-shell ${leftPanelOpen ? '' : 'left-collapsed'} ${inspectorOpen ? '' : 'right-collapsed'} ${bottomPanelOpen ? '' : 'bottom-collapsed'}`.trim()}>
      <GraphViewport onTimelineRange={setTimelineRange} />
      <TopHudBar />
      {leftPanelOpen ? <LeftSidebar /> : null}
      {inspectorOpen ? <RightInspector /> : null}
      {bottomPanelOpen ? <BottomTimeline timelineRange={timelineRange} /> : null}
      <SearchPalette />
    </div>
  );
}
