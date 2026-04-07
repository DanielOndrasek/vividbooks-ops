"""Načítání konfigurace integrací z prostředí."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List

from dotenv import load_dotenv

from vividbooks_ops.tools.commission.month_mode import normalize_month_date_mode


@dataclass(frozen=True)
class PipedriveSettings:
    api_token: str
    domain: str
    category_field_key: str
    deal_month_date_field: str

    @property
    def configured(self) -> bool:
        return bool(self.api_token and self.domain and self.category_field_key)

    def missing_env_names(self) -> List[str]:
        missing: List[str] = []
        if not self.api_token:
            missing.append("PIPEDRIVE_API_TOKEN")
        if not self.domain:
            missing.append("PIPEDRIVE_DOMAIN")
        if not self.category_field_key:
            missing.append("PIPEDRIVE_CATEGORY_FIELD_KEY")
        return missing


@dataclass(frozen=True)
class OperationsSettings:
    pipedrive: PipedriveSettings


def load_settings(*, load_dotenv_file: bool = True) -> OperationsSettings:
    if load_dotenv_file:
        load_dotenv()
    pd = PipedriveSettings(
        api_token=os.getenv("PIPEDRIVE_API_TOKEN", "").strip(),
        domain=os.getenv("PIPEDRIVE_DOMAIN", "").strip(),
        category_field_key=os.getenv("PIPEDRIVE_CATEGORY_FIELD_KEY", "").strip(),
        deal_month_date_field=normalize_month_date_mode(
            os.getenv("PIPEDRIVE_DEAL_MONTH_DATE_FIELD")
        ),
    )
    return OperationsSettings(pipedrive=pd)


def mask_secret(value: str, *, keep_start: int = 4, keep_end: int = 2) -> str:
    """Zobrazí token/API hodnotu bez úniku celého řetězce."""
    if not value:
        return "(prázdné)"
    if len(value) <= keep_start + keep_end:
        return "•" * min(len(value), 8)
    return f"{value[:keep_start]}…{value[-keep_end:]}"
