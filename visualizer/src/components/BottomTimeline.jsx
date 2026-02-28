import { useEffect, useMemo, useState } from 'react';
import { formatDateShort } from '../lib/theme.js';
import { useGraphStore } from '../store/useGraphStore.js';

function playbackDate(timelineRange, timelineWindow) {
  if (!timelineRange.min || !timelineRange.max) return null;
  const min = new Date(timelineRange.min).getTime();
  const max = new Date(timelineRange.max).getTime();
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const ratio = Number(timelineWindow || 100) / 100;
  return new Date(min + (max - min) * ratio).toISOString();
}

export function BottomTimeline({ timelineRange }) {
  const [playing, setPlaying] = useState(false);
  const timelineWindow = useGraphStore((state) => state.timelineWindow);
  const setTimelineWindow = useGraphStore((state) => state.setTimelineWindow);
  const traceEndpoints = useGraphStore((state) => state.traceEndpoints);
  const traceGraph = useGraphStore((state) => state.traceGraph);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setTimelineWindow((current) => {
        const next = typeof current === 'number' ? current + 2 : timelineWindow + 2;
        if (next >= 100) {
          window.clearInterval(timer);
          setPlaying(false);
          return 100;
        }
        return next;
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, [playing, setTimelineWindow, timelineWindow]);

  const playbackAt = useMemo(() => playbackDate(timelineRange, timelineWindow), [timelineRange, timelineWindow]);
  const traceSummary = traceGraph?.meta?.found
    ? `${traceGraph.meta.hopCount} hops${traceGraph.meta.usedInferred ? ' (includes inferred links)' : ''}`
    : traceEndpoints.from && traceEndpoints.to
      ? 'No path found yet'
      : 'Pick two entities to trace';

  return (
    <footer className="bottom-timeline">
      <div className="timeline-block timeline-block-wide">
        <div className="panel-heading">
          <span>Memory Playback</span>
          <strong>{playbackAt ? formatDateShort(playbackAt) : 'No dates'}</strong>
        </div>
        <div className="timeline-compact">
          <button className="panel-button" onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min="10"
            max="100"
            step="1"
            value={timelineWindow}
            onChange={(event) => {
              setPlaying(false);
              setTimelineWindow(Number(event.target.value));
            }}
          />
          <div className="timeline-meta">
            <span>{formatDateShort(timelineRange.min)}</span>
            <span>{timelineWindow}% visible</span>
            <span>{formatDateShort(timelineRange.max)}</span>
          </div>
        </div>
      </div>

      <div className="timeline-block timeline-block-narrow">
        <div className="panel-heading">
          <span>Path Builder</span>
          <strong>{traceSummary}</strong>
        </div>
        <div className="trace-inline">
          <span>{traceEndpoints.from || 'Start node not set'}</span>
          <span>{traceEndpoints.to || 'End node not set'}</span>
        </div>
      </div>
    </footer>
  );
}
