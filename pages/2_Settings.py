"""Přehled napojení na externí služby (proměnné prostředí)."""

import pandas as pd
import streamlit as st

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient
from vividbooks_ops.settings import get_doklady_web_settings, load_settings, mask_secret

st.set_page_config(page_title="Nastavení integrací", layout="wide")

st.title("Nastavení integrací")
_web = get_doklady_web_settings()
_ops = _web.app_url.rstrip("/")
st.info(
    f"**Kompletní nastavení všech integrací** (Gmail, Drive, Claude, Pipedrive, cron) je ve webové "
    f"aplikaci: [{_ops}/settings]({_ops}/settings). Tato stránka zůstává pro rychlý přehled Pipedrive ze Streamlitu."
)
st.caption("Hodnoty se berou z prostředí (`.env` / Docker). Citlivé údaje jsou zkrácené.")

settings = load_settings()
pd_cfg = settings.pipedrive

st.subheader("Pipedrive")
if pd_cfg.configured:
    st.success("Pipedrive je nakonfigurován (token, doména, klíč pole kategorie).")
else:
    st.warning("Chybí: **" + "**, **".join(pd_cfg.missing_env_names()) + "**.")

col1, col2 = st.columns(2)
with col1:
    st.markdown("**PIPEDRIVE_API_TOKEN**")
    st.code(mask_secret(pd_cfg.api_token), language=None)
with col2:
    st.markdown("**PIPEDRIVE_DOMAIN**")
    st.code(pd_cfg.domain or "(prázdné)", language=None)

st.markdown("**PIPEDRIVE_CATEGORY_FIELD_KEY** (`category_field_key` ve Streamlit Secrets)")
st.code(pd_cfg.category_field_key or "(prázdné)", language=None)

with st.expander("Co je **category_field_key** a kde ho vzít?", expanded=not pd_cfg.category_field_key):
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

if pd_cfg.api_token and pd_cfg.domain:
    c_deal, c_lead = st.columns(2)
    with c_deal:
        if st.button("Načíst pole obchodů (deal)", type="secondary", use_container_width=True):
            try:
                client = PipedriveClient(pd_cfg.domain, pd_cfg.api_token)
                fields = client.get_deal_fields()
                rows = [
                    {
                        "key": f.get("key"),
                        "name": f.get("name"),
                        "field_type": f.get("field_type"),
                        "option_count": len(f.get("options") or []),
                    }
                    for f in sorted(
                        fields,
                        key=lambda x: (str(x.get("name") or ""), str(x.get("key") or "")),
                    )
                ]
                st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
                st.caption(
                    "Pro provize vyber řádek, kde **field_type** je typicky `enum` nebo `set`, "
                    "a název odpovídá vašemu poli kategorie."
                )
            except Exception as e:
                st.error(f"Nepodařilo se načíst dealFields: {e}")

    with c_lead:
        if st.button("Načíst pole leadů + volby výčtů", type="secondary", use_container_width=True):
            try:
                client = PipedriveClient(pd_cfg.domain, pd_cfg.api_token)
                fields = client.get_lead_fields()
                rows = []
                for f in sorted(
                    fields,
                    key=lambda x: (str(x.get("name") or ""), str(x.get("key") or "")),
                ):
                    opts = f.get("options") or []
                    if opts:
                        for o in opts:
                            oid = o.get("id") if isinstance(o, dict) else None
                            label = (o.get("label") if isinstance(o, dict) else None) or str(o)
                            rows.append(
                                {
                                    "field_key": f.get("key"),
                                    "field_name": f.get("name"),
                                    "field_type": f.get("field_type"),
                                    "option_id": oid,
                                    "option_label": label,
                                }
                            )
                    else:
                        rows.append(
                            {
                                "field_key": f.get("key"),
                                "field_name": f.get("name"),
                                "field_type": f.get("field_type"),
                                "option_id": None,
                                "option_label": None,
                            }
                        )
                st.dataframe(pd.DataFrame(rows), use_container_width=True, hide_index=True)
                st.caption(
                    "Sloupce **field_key** zkopíruj do vlastní konfigurace; **option_id** a "
                    "**option_label** platí jen u výčtových typů pole (`enum`, `set`, …)."
                )
            except Exception as e:
                st.error(f"Nepodařilo se načíst leadFields: {e}")

st.divider()

st.subheader("Další integrace")
st.info("Další napojení (účetnictví, e-maily, …) přidáme sem jako nové sekce a proměnné v `vividbooks_ops/settings.py`.")

st.subheader("RAG / znalostní báze")
st.info(
    "Sdílená RAG nebo vektorová databáze pro interní dokumenty bude v modulu `vividbooks_ops.rag` "
    "a napojí se z jednotlivých nástrojů podle potřeby."
)
