"""
Memory Constellation - Compact dot grid with importance-based brightness.

Each dot represents a memory, colored by its primary linked entity type.
Importance controls visibility: high = bright bold, low = dim or invisible,
creating an organic star-field effect with natural gaps.
"""

from __future__ import annotations

from textual.widgets import Static

from rich.text import Text

# Entity type to color mapping (Claudia Midnight palette)
ENTITY_COLORS = {
    "person": "#fbbf24",
    "organization": "#60a5fa",
    "project": "#34d399",
    "concept": "#c084fc",
    "location": "#fb923c",
    "unlinked": "#6b7280",
}


class Constellation(Static):
    """Compact grid of colored dots representing memories in Claudia's knowledge sky."""

    DEFAULT_CSS = """
    Constellation {
        height: 100%;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs):
        super().__init__("", **kwargs)
        self._memories: list[dict] = []

    def refresh_data(self, memories: list[dict]):
        """Update constellation data and re-render."""
        self._memories = memories
        self._render_constellation()

    def _render_constellation(self):
        """Render compact dot grid with importance-based brightness."""
        width = max(20, (self.size.width or 50) - 4)

        text = Text()
        for i, mem in enumerate(self._memories):
            entity_type = mem.get("entity_type", "unlinked")
            importance = mem.get("importance", 0.5)
            color = ENTITY_COLORS.get(entity_type, ENTITY_COLORS["unlinked"])

            if importance >= 0.7:
                # High importance: bright bold dot
                text.append("●", style=f"bold {color}")
            elif importance >= 0.3:
                # Medium importance: normal dot
                text.append("●", style=color)
            elif importance >= 0.1:
                # Low importance: tiny dim dot
                text.append("·", style=f"{color} dim")
            else:
                # Very low: invisible (organic gap)
                text.append(" ")

            # Wrap at width
            if (i + 1) % width == 0 and i < len(self._memories) - 1:
                text.append("\n")

        # Compact legend
        if self._memories:
            text.append("\n")
            for etype, color in ENTITY_COLORS.items():
                if etype == "unlinked":
                    continue
                text.append("●", style=f"bold {color}")
                text.append(f"{etype} ", style="#6b7280")

        self.update(text)
