"""
Shared utilities for Claudia Memory System.
"""

from datetime import datetime


def parse_naive(dt_string: str) -> datetime:
    """Parse an ISO datetime string and strip timezone info.

    The database stores a mix of naive and offset-aware datetimes.
    External sources (emails, transcripts, calendar events) often include
    timezone suffixes like +00:00 or Z. Since all timestamps are treated
    as UTC internally, we strip tzinfo to avoid:

        TypeError: can't subtract offset-naive and offset-aware datetimes

    This is used everywhere a parsed timestamp participates in arithmetic
    with datetime.utcnow() (which returns a naive datetime).
    """
    dt = datetime.fromisoformat(dt_string)
    return dt.replace(tzinfo=None) if dt.tzinfo else dt
