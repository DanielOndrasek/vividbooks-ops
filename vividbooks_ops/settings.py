"""Načítání konfigurace integrací z prostředí."""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import List

from dotenv import load_dotenv

# Vividbooks: výchozí API klíč custom pole „Product category“ u dealu v Pipedrive.
# Hodnoty pole odpovídají pravidlům provizí: print, posters, interactive, vividboard.
# Přepíše se proměnnou PIPEDRIVE_CATEGORY_FIELD_KEY / Secrets category_field_key.
DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY = (
    "3f0c870ac132eec72589da1313e2388977c4a74f"
)


def _apply_streamlit_secrets_to_environ() -> None:
    """
    Streamlit Community Cloud: Secrets jsou v st.secrets (TOML), ne v os.environ.
    Multipage app nespouští vždy Home.py — proto to musí běžet při každém load_settings().
    """
    try:
        import streamlit as st
    except ImportError:
        return
    try:
        sec = st.secrets
    except Exception:
        return
    try:
        top_keys = list(sec.keys())
    except Exception:
        return
    for key in top_keys:
        try:
            val = sec[key]
        except Exception:
            continue
        if isinstance(val, Mapping) and not isinstance(val, str | bytes):
            prefix = str(key).upper()
            for nk in val:
                try:
                    nv = val[nk]
                except Exception:
                    continue
                if nv is None:
                    continue
                s = str(nv).strip()
                if not s:
                    continue
                env_key = f"{prefix}_{str(nk).upper()}"
                os.environ.setdefault(env_key, s)
        else:
            if val is None:
                continue
            s = str(val).strip()
            if s:
                os.environ.setdefault(str(key), s)


@dataclass(frozen=True)
class PipedriveSettings:
    api_token: str
    domain: str
    category_field_key: str

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
class DokladyWebSettings:
    """Odkaz na interní Next.js aplikaci (Gmail → doklady) ze Streamlit hubu."""

    app_url: str
    admin_contact: str

    @property
    def has_admin_contact(self) -> bool:
        return bool(self.admin_contact.strip())


@dataclass(frozen=True)
class OperationsSettings:
    pipedrive: PipedriveSettings


def get_doklady_web_settings(*, load_dotenv_file: bool = True) -> DokladyWebSettings:
    """
    URL webové aplikace dokladů a kontakt na admina.
    Lokálně: .env (DOKLADY_APP_URL, DOKLADY_ADMIN_CONTACT).
    Streamlit Cloud: Secrets — buď horní úroveň stejných klíčů, nebo sekce [doklady]
    s klíči app_url a admin_contact (→ DOKLADY_APP_URL / DOKLADY_ADMIN_CONTACT).
    """
    _apply_streamlit_secrets_to_environ()
    if load_dotenv_file:
        load_dotenv()
    return DokladyWebSettings(
        app_url=os.getenv("DOKLADY_APP_URL", "http://localhost:3000").strip(),
        admin_contact=os.getenv("DOKLADY_ADMIN_CONTACT", "").strip(),
    )


def load_settings(*, load_dotenv_file: bool = True) -> OperationsSettings:
    _apply_streamlit_secrets_to_environ()
    if load_dotenv_file:
        load_dotenv()
    cat_key = os.getenv("PIPEDRIVE_CATEGORY_FIELD_KEY", "").strip()
    if not cat_key:
        cat_key = DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY
    pd = PipedriveSettings(
        api_token=os.getenv("PIPEDRIVE_API_TOKEN", "").strip(),
        domain=os.getenv("PIPEDRIVE_DOMAIN", "").strip(),
        category_field_key=cat_key,
    )
    return OperationsSettings(pipedrive=pd)


def mask_secret(value: str, *, keep_start: int = 4, keep_end: int = 2) -> str:
    """Zobrazí token/API hodnotu bez úniku celého řetězce."""
    if not value:
        return "(prázdné)"
    if len(value) <= keep_start + keep_end:
        return "•" * min(len(value), 8)
    return f"{value[:keep_start]}…{value[-keep_end:]}"
