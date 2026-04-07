"""Vividbooks Operations Space — vstupní stránka (hub)."""

import streamlit as st

from vividbooks_ops.settings import get_doklady_web_settings

st.set_page_config(page_title="Vividbooks Operations Space", layout="wide")

cfg = get_doklady_web_settings()
ops_url = cfg.app_url.rstrip("/")

st.title("Vividbooks Operations Space")
st.markdown(
    "Interní provozní nástroje. **Hlavní aplikace** je jedna webová appka (Next.js na Vercelu): "
    "doklady z Gmailu, schvalování faktur, platby na Drive, výpočet provizí z Pipedrive a "
    "sjednocené **Nastavení** všech API klíčů."
)

st.link_button("Otevřít Vividbooks Ops (web)", ops_url, type="primary", use_container_width=False)
st.caption(f"Nebo: `{ops_url}` — nastav `DOKLADY_APP_URL` na produkční URL (lokálně např. http://localhost:3000).")

st.subheader("Streamlit v tomto repu")
st.info(
    "Stránky **Provize** a **Nastavení integrací** v levém menu jsou legacy kopie logiky z Pythonu; "
    "pro běžný provoz používej web výše (stejná data z Pipedrive / stejná pravidla provizí v TS)."
)

st.subheader("Dostupné nástroje (Streamlit)")
st.markdown(
    "- **Provize (Pipedrive)** — měsíční výpočet (Python); v webu: `/commission`.\n"
    "- **Nastavení integrací** — přehled Pipedrive ze `.env`; v webu: `/settings` (Gmail, Drive, Claude, …).\n"
)
