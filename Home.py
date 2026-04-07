"""Vividbooks Operations Space — vstupní stránka (hub)."""

import streamlit as st

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
