"""Odkaz na webovou aplikaci: Gmail → klasifikace dokladů → schválení faktur / platby."""

import streamlit as st

from vividbooks_ops.settings import get_doklady_web_settings

st.set_page_config(page_title="Doklady z Gmailu", layout="wide")

cfg = get_doklady_web_settings()

st.title("Doklady z Gmailu")
st.caption("Samostatná webová aplikace (Next.js) — z tohoto hubu jen přechod a stručný popis.")

st.markdown(
    """
Tato část **Vividbooks Operations Space** nespočítává nic ve Streamlitu — otevře interní nástroj, který:

- stahuje přílohy z vybrané **Gmail** schránky,
- rozlišuje **faktury** a **doklady o platbě**,
- u faktur nabízí **schválení** a až poté ukládá soubor na **Google Drive** (sdílený disk),
- doklady o platbě ukládá na Drive **hned** po zpracování.

Přihlášení do webové aplikace je **Google účtem** (Workspace), role (admin / schvalovatel / čtenář) se nastavují v databázi.
"""
)

st.subheader("Otevřít aplikaci")

if st.link_button("Přejít na aplikaci Doklady", cfg.app_url, type="primary", use_container_width=False):
    pass

st.markdown(f"Nebo zkopíruj adresu: `{cfg.app_url}`")

st.subheader("Kontakt na správce")
if cfg.has_admin_contact:
    st.markdown(
        f"Přístup, role nebo nastavení Gmailu / Drive řeš u: **{cfg.admin_contact}**."
    )
else:
    st.info(
        "Doplň proměnnou **`DOKLADY_ADMIN_CONTACT`** (e-mail nebo Slack) do `.env` nebo do Streamlit "
        "Secrets — zobrazí se zde pro ostatní uživatele."
    )

with st.expander("Konfigurace odkazu (pro admina)"):
    st.markdown(
        """
- **`DOKLADY_APP_URL`** — veřejná URL nasazené Next.js aplikace (např. `https://doklady.vaše-firma.cz`).
  Lokální vývoj: výchozí je `http://localhost:3000`.
- **`DOKLADY_ADMIN_CONTACT`** — viditelný kontakt (jeden řádek textu).

**Streamlit Secrets** (Cloud): buď stejné klíče v kořeni TOML, nebo sekce:

```toml
[doklady]
app_url = "https://…"
admin_contact = "team@…"
```
"""
    )
