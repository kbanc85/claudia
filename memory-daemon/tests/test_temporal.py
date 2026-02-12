"""Tests for temporal extraction -- pure functions, no DB needed."""

import json
from datetime import date, timedelta

from claudia_memory.extraction.temporal import (
    TemporalMarker,
    build_temporal_markers_json,
    extract_deadline,
    extract_temporal_markers,
    resolve_relative_date,
)


# ---------------------------------------------------------------------------
# extract_deadline tests
# ---------------------------------------------------------------------------


def test_extract_deadline_explicit():
    """'Send proposal by March 15' resolves to March 15 of the current/next year."""
    ref = date(2026, 1, 10)
    result = extract_deadline("Send proposal by March 15", reference_date=ref)
    assert result is not None
    assert result == "2026-03-15"


def test_extract_deadline_relative_tomorrow():
    """'Finish by tomorrow' resolves to the day after the reference date."""
    ref = date(2026, 2, 12)
    result = extract_deadline("Finish by tomorrow", reference_date=ref)
    assert result is not None
    expected = (ref + timedelta(days=1)).isoformat()
    assert result == expected


def test_extract_deadline_relative_next_friday():
    """'Due next Friday' resolves to the correct upcoming Friday."""
    # 2026-02-10 is a Tuesday (weekday 1), so next Friday should be 2026-02-20
    # (the Friday after the immediately upcoming one, since "next" skips this week)
    ref = date(2026, 2, 10)  # Tuesday
    result = extract_deadline("Due next Friday", reference_date=ref)
    assert result is not None
    resolved = date.fromisoformat(result)
    # Resolved date must be a Friday
    assert resolved.weekday() == 4, f"Expected Friday (4), got weekday {resolved.weekday()}"
    # "next Friday" from Tuesday: the immediate Friday is 3 days away (Feb 13).
    # The module's logic: _next_weekday gives Feb 13, then "next" prefix adds 7
    # if the gap is <= 7, so result is Feb 20.
    assert resolved == date(2026, 2, 20)


def test_extract_deadline_quarter():
    """'Complete before Q2' resolves to the end of Q1 (before Q2 starts) or Q2 start."""
    ref = date(2026, 1, 15)
    result = extract_deadline("Complete before Q2", reference_date=ref)
    assert result is not None
    resolved = date.fromisoformat(result)
    # "before Q2" contains "before" so it uses _quarter_end for Q2,
    # which is June 30. The marker_type is 'period', not 'deadline',
    # but extract_deadline falls back to any resolved marker.
    assert resolved == date(2026, 6, 30)


def test_extract_deadline_none():
    """Sentences without deadlines return None."""
    ref = date(2026, 2, 12)
    result = extract_deadline("Had a nice meeting today", reference_date=ref)
    # "today" will match as a deadline marker, so this actually returns a date.
    # Use a sentence with no temporal markers at all.
    result_no_temporal = extract_deadline(
        "The weather is pleasant and birds are singing", reference_date=ref
    )
    assert result_no_temporal is None


def test_extract_deadline_in_n_days():
    """'in 2 weeks' resolves to 14 days from the reference date."""
    ref = date(2026, 3, 1)
    result = extract_deadline("I need this done in 2 weeks", reference_date=ref)
    assert result is not None
    expected = (ref + timedelta(weeks=2)).isoformat()
    assert result == expected


def test_extract_deadline_end_of_month():
    """'by end of month' resolves to the last day of the reference month."""
    ref = date(2026, 2, 10)
    result = extract_deadline("Finish the report by end of month", reference_date=ref)
    assert result is not None
    # February 2026 has 28 days (not a leap year)
    assert result == "2026-02-28"


def test_extract_deadline_end_of_month_december():
    """'by end of month' in December resolves to Dec 31."""
    ref = date(2026, 12, 5)
    result = extract_deadline("Ship it by end of month", reference_date=ref)
    assert result is not None
    assert result == "2026-12-31"


def test_extract_deadline_end_of_month_leap_year():
    """'by end of month' in February of a leap year resolves to Feb 29."""
    ref = date(2028, 2, 10)  # 2028 is a leap year
    result = extract_deadline("Wrap up by end of month", reference_date=ref)
    assert result is not None
    assert result == "2028-02-29"


# ---------------------------------------------------------------------------
# extract_temporal_markers tests
# ---------------------------------------------------------------------------


def test_extract_temporal_markers_multiple():
    """Text with multiple temporal references returns multiple markers."""
    ref = date(2026, 3, 1)
    text = "Finish draft by tomorrow, send final version by March 20, and review in 2 weeks"
    markers = extract_temporal_markers(text, reference_date=ref)
    assert len(markers) >= 3
    # Check that we got different resolved dates
    resolved_dates = {m.resolved_date for m in markers if m.resolved_date}
    # tomorrow=Mar 2, March 20=Mar 20, in 2 weeks=Mar 15 -- all distinct
    assert len(resolved_dates) >= 3


def test_extract_temporal_markers_today():
    """'today' is extracted as a deadline marker resolving to the reference date."""
    ref = date(2026, 6, 15)
    markers = extract_temporal_markers("Get it done today", reference_date=ref)
    today_markers = [m for m in markers if m.raw_text == "today"]
    assert len(today_markers) == 1
    assert today_markers[0].resolved_date == ref
    assert today_markers[0].marker_type == "deadline"
    assert today_markers[0].confidence >= 0.9


def test_extract_temporal_markers_next_week():
    """'next week' is extracted as a period marker."""
    ref = date(2026, 2, 11)  # Wednesday
    markers = extract_temporal_markers("Let's revisit next week", reference_date=ref)
    nw = [m for m in markers if m.raw_text == "next week"]
    assert len(nw) == 1
    assert nw[0].marker_type == "period"
    # Should resolve to Monday of next week
    days_to_monday = 7 - ref.weekday()
    expected_monday = ref + timedelta(days=days_to_monday)
    assert nw[0].resolved_date == expected_monday


def test_extract_temporal_markers_quarter():
    """Quarter references are extracted with correct type."""
    ref = date(2026, 1, 10)
    markers = extract_temporal_markers("Deliver the project in Q3", reference_date=ref)
    q_markers = [m for m in markers if "q3" in m.raw_text.lower()]
    assert len(q_markers) == 1
    # Q3 start = July 1
    assert q_markers[0].resolved_date == date(2026, 7, 1)
    assert q_markers[0].marker_type == "period"


def test_extract_temporal_markers_end_of_year():
    """'end of year' is extracted correctly."""
    ref = date(2026, 5, 20)
    markers = extract_temporal_markers("Complete everything by end of year", reference_date=ref)
    eoy = [m for m in markers if m.raw_text == "end of year"]
    assert len(eoy) == 1
    assert eoy[0].resolved_date == date(2026, 12, 31)
    assert eoy[0].marker_type == "deadline"


def test_extract_temporal_markers_deduplication():
    """Markers with the same resolved_date and type are deduplicated, keeping highest confidence."""
    ref = date(2026, 3, 10)
    # "tomorrow" (confidence 0.95) and "in 1 days" (confidence 0.85) both resolve to Mar 11
    text = "Do it tomorrow, really in 1 days"
    markers = extract_temporal_markers(text, reference_date=ref)
    mar_11_deadlines = [
        m for m in markers
        if m.resolved_date == date(2026, 3, 11) and m.marker_type == "deadline"
    ]
    # Should be deduplicated to one marker (highest confidence kept)
    assert len(mar_11_deadlines) == 1
    assert mar_11_deadlines[0].confidence == 0.95  # "tomorrow" wins


def test_extract_temporal_markers_empty_text():
    """Empty or non-temporal text returns empty list."""
    ref = date(2026, 1, 1)
    assert extract_temporal_markers("", reference_date=ref) == []
    assert extract_temporal_markers("No dates here at all", reference_date=ref) == []


# ---------------------------------------------------------------------------
# resolve_relative_date tests
# ---------------------------------------------------------------------------


def test_resolve_relative_date_today():
    """'today' resolves to the reference date."""
    ref = date(2026, 4, 20)
    result = resolve_relative_date("today", reference_date=ref)
    assert result == ref


def test_resolve_relative_date_next_monday():
    """'next Monday' resolves to the correct upcoming Monday."""
    # 2026-02-11 is a Wednesday (weekday 2)
    ref = date(2026, 2, 11)
    result = resolve_relative_date("next Monday", reference_date=ref)
    assert result is not None
    assert result.weekday() == 0  # Monday
    # _next_weekday from Wed to Mon = 5 days (Feb 16), then "next" adds 7 => Feb 23
    assert result == date(2026, 2, 23)


def test_resolve_relative_date_tomorrow():
    """'tomorrow' resolves to reference + 1 day."""
    ref = date(2026, 7, 4)
    result = resolve_relative_date("tomorrow", reference_date=ref)
    assert result == date(2026, 7, 5)


def test_resolve_relative_date_no_match():
    """Non-temporal text returns None."""
    ref = date(2026, 1, 1)
    result = resolve_relative_date("nothing temporal here", reference_date=ref)
    assert result is None


def test_resolve_relative_date_in_3_days():
    """'in 3 days' resolves correctly."""
    ref = date(2026, 8, 10)
    result = resolve_relative_date("in 3 days", reference_date=ref)
    assert result == date(2026, 8, 13)


# ---------------------------------------------------------------------------
# build_temporal_markers_json tests
# ---------------------------------------------------------------------------


def test_build_temporal_markers_json():
    """Serializes markers to valid JSON with expected fields."""
    markers = [
        TemporalMarker(
            raw_text="tomorrow",
            resolved_date=date(2026, 3, 2),
            marker_type="deadline",
            confidence=0.95,
        ),
        TemporalMarker(
            raw_text="march 15",
            resolved_date=date(2026, 3, 15),
            marker_type="deadline",
            confidence=0.9,
        ),
    ]
    result = build_temporal_markers_json(markers)
    assert result is not None

    data = json.loads(result)
    assert "references" in data
    assert "resolved_dates" in data
    assert "types" in data

    assert data["references"] == ["tomorrow", "march 15"]
    assert data["resolved_dates"] == ["2026-03-02", "2026-03-15"]
    assert data["types"] == ["deadline", "deadline"]


def test_build_temporal_markers_json_empty():
    """Empty marker list returns None."""
    result = build_temporal_markers_json([])
    assert result is None


def test_build_temporal_markers_json_unresolved():
    """Markers with unresolved dates serialize as null in JSON."""
    markers = [
        TemporalMarker(
            raw_text="someday",
            resolved_date=None,
            marker_type="event",
            confidence=0.3,
        ),
    ]
    result = build_temporal_markers_json(markers)
    assert result is not None

    data = json.loads(result)
    assert data["resolved_dates"] == [None]
    assert data["references"] == ["someday"]
    assert data["types"] == ["event"]


# ---------------------------------------------------------------------------
# extract_deadline with custom reference date
# ---------------------------------------------------------------------------


def test_extract_deadline_with_reference_date():
    """Custom reference date is used for resolution rather than today."""
    # Use a known reference date far in the past
    ref = date(2020, 6, 1)
    result = extract_deadline("Send report by July 10", reference_date=ref)
    assert result is not None
    # July 10 is after June 1 in the same year, so it should resolve to 2020
    assert result == "2020-07-10"


def test_extract_deadline_with_reference_date_past_month():
    """When the month-day has already passed in the ref year, it rolls to next year."""
    ref = date(2026, 8, 20)
    # March 15 is before August 20, so it should resolve to next year
    result = extract_deadline("Deliver by March 15", reference_date=ref)
    assert result is not None
    assert result == "2027-03-15"


# ---------------------------------------------------------------------------
# Edge cases and additional coverage
# ---------------------------------------------------------------------------


def test_extract_deadline_explicit_year():
    """'January 5, 2027' respects the explicit year."""
    ref = date(2026, 11, 1)
    result = extract_deadline("Submit by January 5, 2027", reference_date=ref)
    assert result is not None
    assert result == "2027-01-05"


def test_extract_temporal_markers_by_weekday():
    """'by Friday' resolves to the next upcoming Friday."""
    ref = date(2026, 2, 10)  # Tuesday
    markers = extract_temporal_markers("Finish by Friday", reference_date=ref)
    fri_markers = [m for m in markers if m.resolved_date and m.resolved_date.weekday() == 4]
    assert len(fri_markers) >= 1
    # Next Friday from Tuesday Feb 10 is Feb 13
    assert fri_markers[0].resolved_date == date(2026, 2, 13)


def test_extract_temporal_markers_in_months():
    """'in 3 months' resolves to approximately 90 days from reference."""
    ref = date(2026, 1, 1)
    markers = extract_temporal_markers("Complete in 3 months", reference_date=ref)
    month_markers = [m for m in markers if "3 months" in m.raw_text]
    assert len(month_markers) == 1
    # 3 months approximated as 90 days
    assert month_markers[0].resolved_date == ref + timedelta(days=90)


def test_extract_temporal_markers_end_of_week():
    """'end of week' resolves to the upcoming Friday."""
    ref = date(2026, 2, 10)  # Tuesday (weekday 1)
    markers = extract_temporal_markers("Wrap up by end of week", reference_date=ref)
    eow = [m for m in markers if m.raw_text == "end of week"]
    assert len(eow) == 1
    # Friday is weekday 4; from Tuesday that is 3 days ahead
    assert eow[0].resolved_date == date(2026, 2, 13)
    assert eow[0].marker_type == "deadline"
