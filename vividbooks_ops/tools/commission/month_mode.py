"""Režim kalendářního měsíce u won dealu (won_time / close_time / auto)."""

from __future__ import annotations

from typing import Optional

MONTH_DATE_MODE_WON = "won_time"
MONTH_DATE_MODE_CLOSE = "close_time"
MONTH_DATE_MODE_AUTO = "auto"


def normalize_month_date_mode(raw: Optional[str]) -> str:
    x = (raw or "").strip().lower()
    if x in ("won_time", "won"):
        return MONTH_DATE_MODE_WON
    if x in ("close_time", "close"):
        return MONTH_DATE_MODE_CLOSE
    return MONTH_DATE_MODE_AUTO
