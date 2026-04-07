"""Přehled napojení na externí služby (proměnné prostředí)."""

import pandas as pd
import streamlit as st

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient
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

st.markdown("**PIPEDRIVE_CATEGORY_FIELD_KEY** (`category_field_key` ve Streamlit Secrets)")
st.code(pd.category_field_key or "(prázdné)", language=None)

with st.expander("Co je **category_field_key** a kde ho vzít?", expanded=not pd.category_field_key):
    st.markdown(
        "Provize se počítají podle **kategorie obchodu** (např. typ produktu). V Pipedrive je ta "
        "kategorie casem **vlastní pole u dealu** (dropdown / multiselect). "
        "Aplikace potřebuje jeho **API klíč** — řetězec jako `abc123def` nebo `uuid…`, "
        "**ne** název, který vidíš v UI.\n\n"
        "**Na Streamlit Cloud:** níže klikni na tlačítko (stačí mít v Secrets už token a doménu) "
        "a v tabulce najdi pole, které odpovídá vaší „kategorii produktu“. Hodnotu ze sloupce **key** "
        "vlož do Secrets jako `category_field_key`.\n\n"
        "**Lokálně:** z kořene projektu `python scripts/setup_pipedrive_fields.py` (s `.env`)."
    )

if pd.api_token and pd.domain:
    if st.button("Načíst pole obchodů z Pipedrive (key → zkopíruj do Secrets)", type="secondary"):
        try:
            client = PipedriveClient(pd.domain, pd.api_token)
            fields = client.get_deal_fields()
            rows = [
                {
                    "key": f.get("key"),
                    "name": f.get("name"),
                    "field_type": f.get("field_type"),
                    "options": len(f.get("options") or []),
                }
                for f in sorted(fields, key=lambda x: (str(x.get("name") or ""), str(x.get("key") or "")))
            ]
            st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
            st.caption(
                "Pro provize vyber řádek, kde **field_type** je typicky `enum` nebo `set`, "
                "a název odpovídá vašemu poli kategorie."
            )
        except Exception as e:
            st.error(f"Nepodařilo se načíst dealFields: {e}")

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
