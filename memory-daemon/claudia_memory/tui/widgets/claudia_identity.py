"""
Claudia Identity - Portrait + status + vital metrics sidebar.

Renders the Claudia pixel art character, daemon status dot,
and compact memory statistics in a borderless sidebar widget.
Portrait traced exactly from bin/index.js lines 47-53.
"""

from __future__ import annotations

from textual.widgets import Static

from rich.text import Text


# Claudia portrait colors -- matching bin/index.js ANSI codes
HAIR = "#fbbf24"       # yellow (ANSI 33)
BODY = "#67e8f9"       # cyan (ANSI 36)
FACE = "#e8e8f8"       # white (ANSI 37)
DIM = "#6b7280"

# Block character
B = "██"


def _build_portrait() -> Text:
    """Build the 7-line Claudia pixel art portrait using Rich Text.

    Traced exactly from bin/index.js lines 47-53:
      y=yellow(hair), b=cyan(body), w=white(face), _=space(eyes)
    """
    text = Text()

    # Line 47:  y██ y██ y██ y██ b██
    text.append("       ")
    text.append(B * 4, style=HAIR)
    text.append(B, style=BODY)
    text.append("\n")

    # Line 48:  y██ w██ w██ w██ w██ w██ b██
    text.append("     ")
    text.append(B, style=HAIR)
    text.append(B * 5, style=FACE)
    text.append(B, style=BODY)
    text.append("\n")

    # Line 49:  y██ w██ __ w██ __ w██ y██
    text.append("     ")
    text.append(B, style=HAIR)
    text.append(B, style=FACE)
    text.append("  ")              # left eye
    text.append(B, style=FACE)
    text.append("  ")              # right eye
    text.append(B, style=FACE)
    text.append(B, style=HAIR)
    text.append("\n")

    # Line 50:  w██ w██ w██ w██ w██
    text.append("       ")
    text.append(B * 5, style=FACE)
    text.append("\n")

    # Line 51:  b██ b██ b██
    text.append("         ")
    text.append(B * 3, style=BODY)
    text.append("\n")

    # Line 52:  b██ b██ b██ b██ b██
    text.append("       ")
    text.append(B * 5, style=BODY)
    text.append("\n")

    # Line 53:  w██ __ w██
    text.append("         ")
    text.append(B, style=FACE)
    text.append("  ")
    text.append(B, style=FACE)

    return text


class ClaudiaIdentity(Static):
    """Claudia portrait + daemon status + vital metrics sidebar."""

    DEFAULT_CSS = """
    ClaudiaIdentity {
        height: auto;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs):
        self._portrait = _build_portrait()
        super().__init__(self._portrait, **kwargs)
        self._health: dict = {}
        self._stats: dict = {}
        self._db_age: str | None = None

    def refresh_data(
        self,
        health: dict,
        stats: dict,
        db_age: str | None,
    ):
        """Update identity data and re-render."""
        self._health = health
        self._stats = stats
        self._db_age = db_age
        self._update_content()

    def _update_content(self):
        """Render portrait + status + vitals."""
        text = Text()

        # Portrait
        text.append_text(self._portrait)
        text.append("\n")

        # Status line
        online = self._health.get("online", False)
        dot_color = "#4ade80" if online else "#f87171"
        status_word = "online" if online else "offline"
        text.append("\n  ")
        text.append("●", style=f"bold {dot_color}")
        text.append(f" {status_word}", style=dot_color)
        if self._db_age:
            text.append(f"  {self._db_age}", style=DIM)

        # Vital metrics
        memories = self._stats.get("memories", 0)
        entities = self._stats.get("entities", 0)
        relationships = self._stats.get("relationships", 0)
        patterns = self._stats.get("patterns", 0)
        mem_today = self._stats.get("memories_today", 0)
        ent_today = self._stats.get("entities_today", 0)

        text.append("\n\n")
        text.append(f"  {memories:,}", style="#e8e8f8")
        text.append(" memories", style=DIM)
        if mem_today:
            text.append(f"  ▲{mem_today}", style="#4ade80")

        text.append("\n")
        text.append(f"    {entities:,}", style="#e8e8f8")
        text.append(" entities", style=DIM)
        if ent_today:
            text.append(f"  ▲{ent_today}", style="#4ade80")

        text.append("\n")
        text.append(f"    {relationships:,}", style="#e8e8f8")
        text.append(" relations", style=DIM)

        text.append("\n")
        text.append(f"     {patterns:,}", style="#e8e8f8")
        text.append(" patterns", style=DIM)

        self.update(text)
