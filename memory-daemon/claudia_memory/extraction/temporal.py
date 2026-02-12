"""
Temporal extraction for Claudia Memory System

Extracts deadline dates and temporal markers from text using regex patterns
and Python's datetime stdlib. No external dependencies required.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import List, Optional

logger = logging.getLogger(__name__)

# Day-of-week names for pattern matching
_DAYS_OF_WEEK = {
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}

_MONTHS = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

_ORDINAL_SUFFIXES = r"(?:st|nd|rd|th)?"


@dataclass
class TemporalMarker:
    """A temporal reference extracted from text."""
    raw_text: str
    resolved_date: Optional[date]
    marker_type: str  # deadline, event, period, recurring
    confidence: float = 0.8


def _next_weekday(ref: date, weekday: int) -> date:
    """Get the next occurrence of a weekday (0=Monday) after ref."""
    days_ahead = weekday - ref.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return ref + timedelta(days=days_ahead)


def _resolve_month_day(month: int, day: int, ref: date) -> Optional[date]:
    """Resolve a month-day pair to a date, preferring future dates."""
    try:
        # Try current year first
        result = date(ref.year, month, day)
        # If it's in the past, use next year
        if result < ref:
            result = date(ref.year + 1, month, day)
        return result
    except ValueError:
        return None


def _quarter_start(quarter: int, year: int) -> date:
    """Get the start date of a quarter."""
    month = (quarter - 1) * 3 + 1
    return date(year, month, 1)


def _quarter_end(quarter: int, year: int) -> date:
    """Get the last day of a quarter."""
    if quarter == 4:
        return date(year, 12, 31)
    return date(year, quarter * 3 + 1, 1) - timedelta(days=1)


def extract_temporal_markers(
    text: str, reference_date: Optional[date] = None
) -> List[TemporalMarker]:
    """Extract temporal references from text.

    Args:
        text: The text to scan for temporal markers.
        reference_date: The date to resolve relative references against.
                       Defaults to today.

    Returns:
        List of extracted TemporalMarker objects.
    """
    ref = reference_date or date.today()
    markers: List[TemporalMarker] = []
    text_lower = text.lower()

    # Pattern: "tomorrow"
    if re.search(r"\btomorrow\b", text_lower):
        markers.append(TemporalMarker(
            raw_text="tomorrow",
            resolved_date=ref + timedelta(days=1),
            marker_type="deadline",
            confidence=0.95,
        ))

    # Pattern: "today"
    if re.search(r"\btoday\b", text_lower):
        markers.append(TemporalMarker(
            raw_text="today",
            resolved_date=ref,
            marker_type="deadline",
            confidence=0.95,
        ))

    # Pattern: "next/this [day of week]"
    for match in re.finditer(
        r"\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday"
        r"|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b",
        text_lower,
    ):
        prefix = match.group(1)
        day_name = match.group(2)
        weekday = _DAYS_OF_WEEK.get(day_name)
        if weekday is not None:
            target = _next_weekday(ref, weekday)
            if prefix == "next" and target - ref <= timedelta(days=7):
                target += timedelta(days=7)
            markers.append(TemporalMarker(
                raw_text=match.group(0),
                resolved_date=target,
                marker_type="deadline",
                confidence=0.9,
            ))

    # Pattern: "by [day of week]" or "before [day of week]"
    for match in re.finditer(
        r"\b(?:by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday"
        r"|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b",
        text_lower,
    ):
        day_name = match.group(1)
        weekday = _DAYS_OF_WEEK.get(day_name)
        if weekday is not None:
            target = _next_weekday(ref, weekday)
            markers.append(TemporalMarker(
                raw_text=match.group(0),
                resolved_date=target,
                marker_type="deadline",
                confidence=0.9,
            ))

    # Pattern: "in N days/weeks/months"
    for match in re.finditer(
        r"\bin\s+(\d+)\s+(day|days|week|weeks|month|months)\b", text_lower
    ):
        count = int(match.group(1))
        unit = match.group(2)
        if "day" in unit:
            delta = timedelta(days=count)
        elif "week" in unit:
            delta = timedelta(weeks=count)
        elif "month" in unit:
            delta = timedelta(days=count * 30)  # Approximate
        else:
            continue
        markers.append(TemporalMarker(
            raw_text=match.group(0),
            resolved_date=ref + delta,
            marker_type="deadline",
            confidence=0.85,
        ))

    # Pattern: "by/before/due [Month] [Day]" or "[Month] [Day]"
    month_pattern = "|".join(_MONTHS.keys())
    for match in re.finditer(
        rf"\b(?:by|before|due|on)?\s*({month_pattern})\s+(\d{{1,2}}){_ORDINAL_SUFFIXES}"
        rf"(?:\s*,?\s*(\d{{4}}))?",
        text_lower,
    ):
        month_name = match.group(1)
        day_num = int(match.group(2))
        year_str = match.group(3)
        month_num = _MONTHS.get(month_name)
        if month_num and 1 <= day_num <= 31:
            if year_str:
                try:
                    resolved = date(int(year_str), month_num, day_num)
                except ValueError:
                    resolved = None
            else:
                resolved = _resolve_month_day(month_num, day_num, ref)
            if resolved:
                markers.append(TemporalMarker(
                    raw_text=match.group(0).strip(),
                    resolved_date=resolved,
                    marker_type="deadline",
                    confidence=0.9,
                ))

    # Pattern: "by/before/due [Day] [Month]" (European date format)
    for match in re.finditer(
        rf"\b(?:by|before|due|on)?\s*(\d{{1,2}}){_ORDINAL_SUFFIXES}\s+({month_pattern})"
        rf"(?:\s*,?\s*(\d{{4}}))?",
        text_lower,
    ):
        day_num = int(match.group(1))
        month_name = match.group(2)
        year_str = match.group(3)
        month_num = _MONTHS.get(month_name)
        if month_num and 1 <= day_num <= 31:
            if year_str:
                try:
                    resolved = date(int(year_str), month_num, day_num)
                except ValueError:
                    resolved = None
            else:
                resolved = _resolve_month_day(month_num, day_num, ref)
            if resolved:
                markers.append(TemporalMarker(
                    raw_text=match.group(0).strip(),
                    resolved_date=resolved,
                    marker_type="deadline",
                    confidence=0.85,
                ))

    # Pattern: "Q1/Q2/Q3/Q4" or "end of Q1" etc.
    for match in re.finditer(
        r"\b(?:(?:end\s+of|before|by)\s+)?[Qq]([1-4])(?:\s+(\d{4}))?\b", text_lower
    ):
        quarter = int(match.group(1))
        year = int(match.group(2)) if match.group(2) else ref.year
        raw = match.group(0).strip()

        if "end" in raw or "before" in raw or "by" in raw:
            resolved = _quarter_end(quarter, year)
        else:
            # Default: start of the quarter as a reference point
            resolved = _quarter_start(quarter, year)

        # If this quarter has passed, use next year
        if resolved < ref and not match.group(2):
            resolved = resolved.replace(year=resolved.year + 1)

        markers.append(TemporalMarker(
            raw_text=raw,
            resolved_date=resolved,
            marker_type="period",
            confidence=0.8,
        ))

    # Pattern: "end of month" / "end of the month"
    if re.search(r"\bend\s+of\s+(?:the\s+)?month\b", text_lower):
        # Last day of current month
        if ref.month == 12:
            eom = date(ref.year + 1, 1, 1) - timedelta(days=1)
        else:
            eom = date(ref.year, ref.month + 1, 1) - timedelta(days=1)
        markers.append(TemporalMarker(
            raw_text="end of month",
            resolved_date=eom,
            marker_type="deadline",
            confidence=0.85,
        ))

    # Pattern: "end of week" / "end of the week"
    if re.search(r"\bend\s+of\s+(?:the\s+)?week\b", text_lower):
        # Friday of current week
        days_to_friday = 4 - ref.weekday()
        if days_to_friday <= 0:
            days_to_friday += 7
        markers.append(TemporalMarker(
            raw_text="end of week",
            resolved_date=ref + timedelta(days=days_to_friday),
            marker_type="deadline",
            confidence=0.85,
        ))

    # Pattern: "end of year"
    if re.search(r"\bend\s+of\s+(?:the\s+)?year\b", text_lower):
        markers.append(TemporalMarker(
            raw_text="end of year",
            resolved_date=date(ref.year, 12, 31),
            marker_type="deadline",
            confidence=0.8,
        ))

    # Pattern: "next week" / "next month"
    if re.search(r"\bnext\s+week\b", text_lower):
        # Monday of next week
        days_to_monday = 7 - ref.weekday()
        markers.append(TemporalMarker(
            raw_text="next week",
            resolved_date=ref + timedelta(days=days_to_monday),
            marker_type="period",
            confidence=0.7,
        ))

    if re.search(r"\bnext\s+month\b", text_lower):
        if ref.month == 12:
            next_m = date(ref.year + 1, 1, 1)
        else:
            next_m = date(ref.year, ref.month + 1, 1)
        markers.append(TemporalMarker(
            raw_text="next month",
            resolved_date=next_m,
            marker_type="period",
            confidence=0.7,
        ))

    # Deduplicate by resolved_date (keep highest confidence)
    seen: dict = {}
    for m in markers:
        key = (m.resolved_date, m.marker_type)
        if key not in seen or m.confidence > seen[key].confidence:
            seen[key] = m
    return list(seen.values())


def resolve_relative_date(
    marker: str, reference_date: Optional[date] = None
) -> Optional[date]:
    """Resolve a single temporal expression to a date.

    Convenience function for extracting a single date from a marker string.
    Returns the most confident resolved date, or None if no temporal
    reference is found.
    """
    markers = extract_temporal_markers(marker, reference_date)
    if not markers:
        return None
    # Return the highest-confidence marker
    best = max(markers, key=lambda m: m.confidence)
    return best.resolved_date


def extract_deadline(
    content: str, reference_date: Optional[date] = None
) -> Optional[str]:
    """Extract the most likely deadline from commitment text.

    Looks for deadline-specific patterns (by/before/due prefixes) and returns
    the resolved date as an ISO string, or None if no deadline is found.

    Args:
        content: The commitment text to scan.
        reference_date: Reference date for relative resolution. Defaults to today.

    Returns:
        ISO date string (YYYY-MM-DD) or None.
    """
    markers = extract_temporal_markers(content, reference_date)
    # Prefer markers with deadline type and high confidence
    deadline_markers = [m for m in markers if m.marker_type == "deadline" and m.resolved_date]
    if deadline_markers:
        best = max(deadline_markers, key=lambda m: m.confidence)
        return best.resolved_date.isoformat()
    # Fall back to any resolved marker
    resolved = [m for m in markers if m.resolved_date]
    if resolved:
        best = max(resolved, key=lambda m: m.confidence)
        return best.resolved_date.isoformat()
    return None


def build_temporal_markers_json(
    markers: List[TemporalMarker],
) -> Optional[str]:
    """Serialize temporal markers to JSON for storage in temporal_markers column.

    Returns JSON string or None if no markers.
    """
    if not markers:
        return None
    data = {
        "references": [m.raw_text for m in markers],
        "resolved_dates": [
            m.resolved_date.isoformat() if m.resolved_date else None
            for m in markers
        ],
        "types": [m.marker_type for m in markers],
    }
    return json.dumps(data)
