"""Přehled napojení na externí služby (proměnné prostředí)."""

import streamlit as st

from vividbooks_ops.settings import load_settings, mask_secret

st.set_page_config(page_title="Nastavení integrací", layout="wide")

st.title("Nastavení integrací")
st.caption("Hodnoty se berou z prostředí (`.env` / Docker). Citlivé údaje jsou zkrácené.")

settings = load_settings()
pd = settings.pipedrive

st.subheader("Pipedrive")
if pd.configured:
    st.success("Pipedrive je nakonfigurován (token, doména, klíč pole kategorie).")
else:
    st.warning("Chybí: **" + "**, **".join(pd.missing_env_names()) + "**.")

col1, col2 = st.columns(2)
with col1:
    st.markdown("**PIPEDRIVE_API_TOKEN**")
    st.code(mask_secret(pd.api_token), language=None)
with col2:
    st.markdown("**PIPEDRIVE_DOMAIN**")
    st.code(pd.domain or "(prázdné)", language=None)

st.markdown("**PIPEDRIVE_CATEGORY_FIELD_KEY**")
st.code(pd.category_field_key or "(prázdné)", language=None)

st.markdown("**PIPEDRIVE_DEAL_MONTH_DATE_FIELD** (výchozí pro výběr měsíce dealu)")
st.code(pd.deal_month_date_field, language=None)

st.divider()

st.subheader("Další integrace")
st.info("Další napojení (účetnictví, e-maily, …) přidáme sem jako nové sekce a proměnné v `vividbooks_ops/settings.py`.")

st.subheader("RAG / znalostní báze")
st.info(
    "Sdílená RAG nebo vektorová databáze pro interní dokumenty bude v modulu `vividbooks_ops.rag` "
    "a napojí se z jednotlivých nástrojů podle potřeby."
)
