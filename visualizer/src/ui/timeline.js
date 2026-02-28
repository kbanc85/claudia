/**
 * Claudia Brain v4 -- Timeline scrubber
 *
 * Bottom bar with slider, play/pause, speed control, and density histogram.
 * Filters graph by creation date.
 */

import { filterNodes, resetFilter } from '../data/store.js';

let timelineRange = { start: null, end: null };

export function initTimeline() {
  const slider = document.getElementById('timeline-slider');
  const currentLabel = document.getElementById('timeline-current');
  const playBtn = document.getElementById('timeline-play');
  const speedBtn = document.getElementById('timeline-speed');

  if (!slider || !playBtn || !speedBtn) return;

  let playing = false;
  let speed = 1;
  let playInterval = null;

  slider.addEventListener('input', () => {
    const pct = parseInt(slider.value, 10) / 100;
    if (!timelineRange.start || !timelineRange.end) return;

    const totalMs = timelineRange.end - timelineRange.start;
    const cutoffDate = new Date(timelineRange.start.getTime() + totalMs * pct);

    if (currentLabel) {
      currentLabel.textContent = formatDate(cutoffDate.toISOString());
    }

    if (pct >= 0.99) {
      resetFilter();
    } else {
      filterNodes(node => {
        if (!node.createdAt) return true;
        const d = new Date(node.createdAt.replace(' ', 'T'));
        return d <= cutoffDate;
      });
    }
  });

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '\u23F8' : '\u25B6';

    if (playing) {
      let value = parseInt(slider.value, 10);
      if (value >= 100) value = 0;

      playInterval = setInterval(() => {
        value = Math.min(100, value + speed);
        slider.value = value;
        slider.dispatchEvent(new Event('input'));
        if (value >= 100) {
          playing = false;
          playBtn.textContent = '\u25B6';
          clearInterval(playInterval);
        }
      }, 100);
    } else {
      clearInterval(playInterval);
    }
  });

  speedBtn.addEventListener('click', () => {
    const speeds = [1, 2, 5, 10];
    const idx = (speeds.indexOf(speed) + 1) % speeds.length;
    speed = speeds[idx];
    speedBtn.textContent = `${speed}x`;
  });
}

/**
 * Update timeline with events data.
 * @param {Array} events - Array of { timestamp } objects
 */
export function updateTimeline(events) {
  if (!events || events.length === 0) return;

  const dates = events.map(e => new Date(e.timestamp?.replace(' ', 'T')));
  const validDates = dates.filter(d => !isNaN(d.getTime()));
  if (validDates.length === 0) return;

  timelineRange.start = new Date(Math.min(...validDates));
  timelineRange.end = new Date(Math.max(...validDates));

  const startLabel = document.getElementById('timeline-start');
  const endLabel = document.getElementById('timeline-end');
  if (startLabel) startLabel.textContent = formatDate(timelineRange.start.toISOString());
  if (endLabel) endLabel.textContent = 'Now';

  drawDensityHistogram(events);
}

function drawDensityHistogram(events) {
  const container = document.getElementById('timeline-density');
  if (!container) return;
  container.replaceChildren();

  if (events.length === 0 || !timelineRange.start || !timelineRange.end) return;

  const totalMs = timelineRange.end - timelineRange.start;
  if (totalMs <= 0) return;

  const bucketCount = 60;
  const buckets = new Array(bucketCount).fill(0);
  const bucketSize = totalMs / bucketCount;

  for (const event of events) {
    const d = new Date(event.timestamp?.replace(' ', 'T'));
    if (isNaN(d.getTime())) continue;
    const bucket = Math.min(bucketCount - 1, Math.floor((d - timelineRange.start) / bucketSize));
    buckets[bucket]++;
  }

  const maxCount = Math.max(...buckets, 1);

  for (let i = 0; i < bucketCount; i++) {
    const bar = document.createElement('div');
    bar.style.display = 'inline-block';
    bar.style.width = `${100 / bucketCount}%`;
    bar.style.height = `${(buckets[i] / maxCount) * 16}px`;
    bar.style.background = 'var(--accent)';
    bar.style.opacity = String(0.2 + (buckets[i] / maxCount) * 0.6);
    bar.style.verticalAlign = 'bottom';
    container.appendChild(bar);
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
