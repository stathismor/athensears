"""Date formatting and parsing utilities."""
from datetime import datetime, timedelta
from typing import Optional
import re


def parse_flexible_date(date_str: str) -> Optional[datetime]:
    """Parse date string in various formats.

    Handles formats like:
    - ISO 8601: "2026-02-15T20:00:00"
    - Date only: "2026-02-15"
    - Human readable: "15 February 2026"
    - Greek format: "15/02/2026"
    """
    if not date_str:
        return None

    # Try ISO format first
    for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]:
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except ValueError:
            continue

    return None


def get_date_range_query(days_ahead: int = 30) -> str:
    """Generate date range string for search queries.

    Args:
        days_ahead: Number of days to look ahead

    Returns:
        String like "January-February 2026"
    """
    today = datetime.now()
    future = today + timedelta(days=days_ahead)

    if today.month == future.month:
        return today.strftime("%B %Y")
    else:
        return f"{today.strftime('%B')}-{future.strftime('%B %Y')}"


def format_date_for_strapi(dt: datetime) -> str:
    """Format datetime for Strapi API."""
    return dt.isoformat()
