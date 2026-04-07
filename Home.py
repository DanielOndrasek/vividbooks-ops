"""Vividbooks Operations Space — vstupní stránka (hub)."""

from __future__ import annotations

import os

import streamlit as st


def _apply_streamlit_secrets_to_environ() -> None:
    """
    Na Streamlit Community Cloud jsou hodnoty v App secrets (TOML).
    Propíšeme je do os.environ, aby fungoval vividbooks_ops.settings.load_settings().
    """
    try:
        raw = dict(st.secrets)
    except Exception:
        return
    for key, val in raw.items():
        if isinstance(val, dict):
            prefix = str(key).upper()
            for nk, nv in val.items():
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


_apply_streamlit_secrets_to_environ()

st.set_page_config(page_title="Vividbooks Operations Space", layout="wide")

st.title("Vividbooks Operations Space")
st.markdown(
    "Centrální místo pro interní provozní nástroje, napojení na externí API a (v budoucnu) sdílené znalostní zdroje."
)
st.info("Vyber nástroj nebo **Nastavení integrací** v navigaci vlevo.")

st.subheader("Dostupné nástroje")
st.markdown(
    "- **Provize (Pipedrive)** — měsíční výpočet provizí z won dealů.\n"
    "- Další nástroje přibudou jako nové stránky v `pages/`."
)
