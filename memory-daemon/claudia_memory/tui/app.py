"""
Claudia Brain Monitor v2 - Compact Futuristic HUD

A nimble, borderless terminal dashboard for watching Claudia's memory system.
4-panel layout: identity sidebar, constellation, memory landscape, neural pulse strip.
"""

from __future__ import annotations

import logging
from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Horizontal, Vertical

from .data_source import DataSource
from .widgets import (
    ClaudiaIdentity,
    Constellation,
    MemoryLandscape,
    NeuralPulse,
)

logger = logging.getLogger(__name__)


class BrainMonitor(App):
    """Claudia Brain Monitor v2 - compact futuristic HUD."""

    TITLE = "Claudia Brain Monitor"
    CSS_PATH = "styles.tcss"

    BINDINGS = [
        ("q", "quit", "Quit"),
        ("r", "force_refresh", "Refresh"),
        ("t", "toggle_dark", "Theme"),
    ]

    def __init__(self, db_path: Path | None = None, **kwargs):
        super().__init__(**kwargs)
        self._ds = DataSource(db_path=db_path)

    def compose(self) -> ComposeResult:
        with Horizontal(id="main"):
            yield ClaudiaIdentity(id="identity")
            with Vertical(id="right"):
                yield Constellation(id="constellation")
                yield MemoryLandscape(id="landscape")
        yield NeuralPulse(id="pulse")

    def on_mount(self) -> None:
        """Start refresh timers on mount."""
        self.call_later(self._refresh_all)
        # Fast (3s): pulse + identity
        self.set_interval(3.0, self._refresh_fast)
        # Medium (10s): constellation + landscape
        self.set_interval(10.0, self._refresh_medium)

    def _refresh_all(self) -> None:
        """Full refresh of all panels."""
        self._refresh_fast()
        self._refresh_medium()

    def _refresh_fast(self) -> None:
        """Refresh fast-updating panels: pulse, identity."""
        try:
            # Neural Pulse
            ts = self._ds.get_activity_timeseries()
            pulse = self.query_one("#pulse", NeuralPulse)
            pulse.refresh_data(ts["writes"], ts["reads"], ts["links"])

            # Identity (health + stats)
            health = self._ds.get_health()
            stats = self._ds.get_stats()
            db_age = self._ds.get_db_age()
            identity = self.query_one("#identity", ClaudiaIdentity)
            identity.refresh_data(health, stats, db_age)

        except Exception as e:
            logger.debug(f"Fast refresh error: {e}")

    def _refresh_medium(self) -> None:
        """Refresh medium-updating panels: constellation, landscape."""
        try:
            # Constellation
            memories = self._ds.get_memory_constellation()
            const = self.query_one("#constellation", Constellation)
            const.refresh_data(memories)

            # Memory Landscape
            histogram = self._ds.get_importance_histogram()
            type_counts = self._ds.get_memory_type_counts()
            landscape = self.query_one("#landscape", MemoryLandscape)
            landscape.refresh_data(histogram, type_counts)

        except Exception as e:
            logger.debug(f"Medium refresh error: {e}")

    def action_force_refresh(self) -> None:
        """Handle 'r' key - force full refresh."""
        self._refresh_all()

    def on_unmount(self) -> None:
        """Clean up data source on exit."""
        self._ds.close()


def run_brain_monitor(db_path: Path | None = None) -> None:
    """Launch the Brain Monitor TUI."""
    from . import check_dependencies

    check_dependencies()
    app = BrainMonitor(db_path=db_path)
    try:
        app.run()
    finally:
        app._ds.close()
