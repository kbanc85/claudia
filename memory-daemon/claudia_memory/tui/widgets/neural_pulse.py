"""
Neural Pulse - Compact 1-line animated braille waveform strip.

All 3 channels (writes, reads, links) render on a single line with
single-letter labels. Second line shows keybinding hints and branding.
"""

from __future__ import annotations

from textual.widgets import Static

from rich.text import Text


class NeuralPulse(Static):
    """Compact 1-line braille waveform strip for memory activity."""

    BRAILLE_CHARS = " ⡀⡄⡆⣆⣦⣶⣷⣿"

    DEFAULT_CSS = """
    NeuralPulse {
        height: auto;
        max-height: 3;
        padding: 0 1;
    }
    """

    def __init__(self, **kwargs):
        super().__init__("", **kwargs)
        self._writes: list[int] = [0] * 20
        self._reads: list[int] = [0] * 20
        self._links: list[int] = [0] * 20

    def _value_to_braille(self, values: list[int], width: int) -> str:
        """Convert a list of integer values to braille bar characters."""
        if not values:
            return " " * width

        max_val = max(max(values), 1)
        chars = self.BRAILLE_CHARS
        n = len(chars) - 1

        result = []
        for v in values[-width:]:
            idx = min(int((v / max_val) * n), n)
            result.append(chars[idx])

        while len(result) < width:
            result.insert(0, chars[0])

        return "".join(result)

    def refresh_data(self, writes: list[int], reads: list[int], links: list[int]):
        """Update waveform data and re-render."""
        self._writes = writes
        self._reads = reads
        self._links = links
        self._render_pulse()

    def _render_pulse(self):
        """Render all 3 waveforms on one compact line."""
        # Divide available width among 3 channels
        total_width = max(30, (self.size.width or 80) - 16)
        chan_width = total_width // 3

        w_bar = self._value_to_braille(self._writes, chan_width)
        r_bar = self._value_to_braille(self._reads, chan_width)
        l_bar = self._value_to_braille(self._links, chan_width)

        text = Text()

        # Line 1: all 3 waveforms with single-letter labels
        text.append("w ", style="bold #fbbf24")
        text.append(w_bar, style="#fbbf24")
        text.append("  r ", style="bold #60a5fa")
        text.append(r_bar, style="#60a5fa")
        text.append("  l ", style="bold #34d399")
        text.append(l_bar, style="#34d399")

        # Line 2: keybinding hints left, branding right
        hints = "q quit · r refresh · t theme"
        brand = "brain monitor"
        gap = max(1, (self.size.width or 80) - 4 - len(hints) - len(brand))

        text.append("\n")
        text.append(hints, style="#6b7280 dim")
        text.append(" " * gap)
        text.append(brand, style="#818cf8 dim")

        self.update(text)
