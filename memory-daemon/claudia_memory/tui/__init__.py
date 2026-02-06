"""
Claudia Brain Monitor - Terminal Dashboard

A stunning TUI dashboard for monitoring Claudia's memory system in real-time.
Uses Python Textual for rich terminal rendering with Claudia's Midnight theme.

Requires optional dependencies: pip install claudia-memory[tui]
"""

try:
    from textual.app import App as _App  # noqa: F401

    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False


def check_dependencies():
    """Check that TUI dependencies are installed, raise helpful error if not."""
    if not TEXTUAL_AVAILABLE:
        raise ImportError(
            "The Brain Monitor requires additional dependencies.\n"
            "Install them with: pip install claudia-memory[tui]\n"
            "Or: pip install textual textual-plotext"
        )
