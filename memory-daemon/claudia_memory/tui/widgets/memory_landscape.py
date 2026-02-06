"""
Memory Landscape - Importance sparkline + 2-column type bar chart.

Compact visualization: 1-line importance distribution sparkline,
then memory types displayed in two side-by-side columns.
"""

from __future__ import annotations

from textual.widgets import Static

from rich.text import Text


# Memory type colors (Claudia Midnight palette)
TYPE_COLORS = {
    "fact": "#c8c8e0",        # soft lavender (neutral)
    "observation": "#93c5fd",  # light blue
    "preference": "#fbbf24",   # amber
    "learning": "#4ade80",     # green
    "commitment": "#f87171",   # red
    "pattern": "#c084fc",      # violet
}

DEFAULT_TYPE_COLOR = "#6b7280"

# Braille sparkline chars (8 levels)
SPARK_CHARS = "▁▂▃▄▅▆▇█"


class MemoryLandscape(Static):
    """Importance sparkline + 2-column memory type bars."""

    DEFAULT_CSS = """
    MemoryLandscape {
        height: auto;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs):
        super().__init__("", **kwargs)
        self._histogram: list[float] = []
        self._type_counts: dict[str, int] = {}

    def refresh_data(self, histogram: list[float], type_counts: dict[str, int]):
        """Update landscape data and re-render."""
        self._histogram = histogram
        self._type_counts = type_counts
        self._render_landscape()

    def _render_sparkline(self, values: list[float], width: int) -> Text:
        """Render importance distribution as a compact sparkline."""
        text = Text()
        if not values or max(values) == 0:
            text.append("▁" * width, style="#6b7280 dim")
            text.append("  importance", style="#6b7280 dim")
            return text

        max_val = max(values)
        n = len(SPARK_CHARS) - 1

        for v in values[-width:]:
            idx = min(int((v / max_val) * n), n) if max_val > 0 else 0
            if idx <= 2:
                style = "#6b7280"
            elif idx <= 4:
                style = "#818cf8"
            elif idx <= 6:
                style = "#f59e0b"
            else:
                style = "#fbbf24"
            text.append(SPARK_CHARS[idx], style=style)

        text.append("  importance", style="#6b7280 dim")
        return text

    def _render_type_bars(self) -> Text:
        """Render 2-column horizontal bar chart of memory types."""
        text = Text()

        if not self._type_counts:
            text.append("No memories yet", style="#6b7280")
            return text

        sorted_types = sorted(self._type_counts.items(), key=lambda x: -x[1])
        max_count = max(self._type_counts.values())

        # 2-column layout: split into left and right
        col_bar_width = 10
        mid = (len(sorted_types) + 1) // 2
        left = sorted_types[:mid]
        right = sorted_types[mid:]

        for i in range(mid):
            # Left column
            mtype, count = left[i]
            color = TYPE_COLORS.get(mtype, DEFAULT_TYPE_COLOR)
            fill = max(1, int((count / max_count) * col_bar_width))

            text.append(f"{mtype:<11}", style="#c8c8e0 dim")
            text.append("█" * fill, style=color)
            text.append("░" * (col_bar_width - fill), style="#1a1a2e")
            text.append(f" {count:<5}", style="#c8c8e0")

            # Right column (if exists)
            if i < len(right):
                mtype_r, count_r = right[i]
                color_r = TYPE_COLORS.get(mtype_r, DEFAULT_TYPE_COLOR)
                fill_r = max(1, int((count_r / max_count) * col_bar_width))

                text.append(f"  {mtype_r:<11}", style="#c8c8e0 dim")
                text.append("█" * fill_r, style=color_r)
                text.append("░" * (col_bar_width - fill_r), style="#1a1a2e")
                text.append(f" {count_r:<5}", style="#c8c8e0")

            if i < mid - 1:
                text.append("\n")

        return text

    def _render_landscape(self):
        """Render combined sparkline + 2-column bar chart."""
        width = max(10, (self.size.width or 50) - 16)

        text = self._render_sparkline(self._histogram, width)
        text.append("\n\n")
        text.append_text(self._render_type_bars())

        self.update(text)
