"""Nástroj: měsíční provize z Pipedrive won dealů."""

from __future__ import annotations

import io
from calendar import monthrange
from datetime import date
from typing import Any, Dict, List, Tuple

import altair as alt
import pandas as pd
import streamlit as st

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient
from vividbooks_ops.settings import load_settings
from vividbooks_ops.tools.commission.logic import (
    MONTH_DATE_MODE_AUTO,
    MONTH_DATE_MODE_CLOSE,
    MONTH_DATE_MODE_WON,
    DealCommissionRow,
    aggregate_by_owner,
    build_category_option_map,
    build_full_month_export_rows,
    build_value_diagnostics,
    collect_won_deals_in_month,
    compute_commissions_for_month,
    dataframe_commission_by_category_and_pipeline_bucket,
    dataframe_commission_by_owner_and_category,
    deal_category_present,
    rows_to_dataframe_rows,
)
from vividbooks_ops.tools.commission.rules import COMMISSION_RULES

_MONTH_MODE_LABELS = {
    MONTH_DATE_MODE_AUTO: "auto — won_time, jinak close_time",
    MONTH_DATE_MODE_WON: "jen won_time",
    MONTH_DATE_MODE_CLOSE: "jen close_time (uzavření)",
}


def _prev_month(today: date) -> Tuple[int, int]:
    if today.month == 1:
        return today.year - 1, 12
    return today.year, today.month - 1


def _fmt_money(n: float) -> str:
    s = f"{n:,.2f}"
    whole, frac = s.split(".")
    whole = whole.replace(",", "\u00a0")
    return f"{whole},{frac}"


def _fmt_int(n: int) -> str:
    return f"{n:,}".replace(",", "\u00a0")


def _chart_owner_category(df: pd.DataFrame) -> alt.Chart:
    n_owners = int(df["obchodník"].nunique()) if not df.empty else 1
    return (
        alt.Chart(df)
        .mark_bar()
        .encode(
            x=alt.X("provize:Q", stack="zero", title="Provize"),
            y=alt.Y("obchodník:N", sort="-x", title=None),
            color=alt.Color("product_category:N", title="Product category"),
            tooltip=[
                alt.Tooltip("obchodník:N", title="Obchodník"),
                alt.Tooltip("product_category:N", title="Kategorie"),
                alt.Tooltip("provize:Q", format=",.2f", title="Provize"),
            ],
        )
        .properties(height=max(220, min(520, 28 * n_owners)), padding={"left": 8})
    )


def _chart_category_pipeline(df: pd.DataFrame) -> alt.Chart:
    if df.empty:
        return alt.Chart(df).mark_bar()
    order = (
        df.groupby("product_category", as_index=False)["provize"]
        .sum()
        .sort_values("provize", ascending=False)["product_category"]
        .tolist()
    )
    return (
        alt.Chart(df)
        .mark_bar()
        .encode(
            x=alt.X(
                "product_category:N",
                sort=order,
                title="Product category",
                axis=alt.Axis(labelAngle=-30, labelLimit=200),
            ),
            y=alt.Y("provize:Q", stack="zero", title="Provize"),
            color=alt.Color("pipeline_bucket:N", title="Pipeline (zjednodušeno)"),
            tooltip=[
                alt.Tooltip("product_category:N", title="Kategorie"),
                alt.Tooltip("pipeline_bucket:N", title="Pipeline"),
                alt.Tooltip("provize:Q", format=",.2f", title="Provize"),
            ],
        )
        .properties(height=380, padding={"bottom": 12})
    )


@st.cache_resource
def get_pipedrive_client(domain: str, token: str) -> PipedriveClient:
    return PipedriveClient(domain, token)


def _fetch_context(
    client: PipedriveClient,
    category_field_key: str,
) -> Tuple[
    List[Dict[str, Any]],
    Dict[int, str],
    Dict[int, str],
    Dict[str, str],
]:
    deal_fields = client.get_deal_fields()
    option_map = build_category_option_map(deal_fields, category_field_key)

    pipelines_raw = client.get_pipelines()
    pipelines_map: Dict[int, str] = {}
    for p in pipelines_raw:
        pid = p.get("id")
        name = p.get("name")
        if pid is not None and name is not None:
            pipelines_map[int(pid)] = str(name)

    users_raw = client.get_users()
    user_map: Dict[int, str] = {}
    for u in users_raw:
        uid = u.get("id")
        name = u.get("name")
        if uid is not None and name is not None:
            user_map[int(uid)] = str(name)

    deals = client.get_all_won_deals()
    # Seznam /deals často nevrací custom pole — doplníme GET /deals/{id} tam, kde chybí kategorie
    deals = client.enrich_deals_with_full_details(
        deals,
        has_category_value=lambda d: deal_category_present(d, category_field_key),
    )
    return deals, pipelines_map, user_map, option_map


def main() -> None:
    st.set_page_config(page_title="Provize Pipedrive", layout="wide")
    st.title("Měsíční provize z Pipedrive")

    settings = load_settings()
    pd_cfg = settings.pipedrive
    token, domain, cat_key = pd_cfg.api_token, pd_cfg.domain, pd_cfg.category_field_key

    if "commission_rows" not in st.session_state:
        st.session_state.commission_rows = None
    if "commission_meta" not in st.session_state:
        st.session_state.commission_meta = None
    if "value_diagnostics" not in st.session_state:
        st.session_state.value_diagnostics = None
    if "csv_export_context" not in st.session_state:
        st.session_state.csv_export_context = None

    today = date.today()
    py, pm = _prev_month(today)

    with st.sidebar:
        st.caption(
            "Z Pipedrive se berou **jen won** dealy; do měsíce se zařadí podle volby data níže."
        )
        st.subheader("Období")
        # Formulář: změna roku/měsíce/režimu nespouští přepočet stránky — až tlačítko (méně problikávání).
        with st.form("commission_run", border=False):
            year = st.number_input(
                "Rok",
                min_value=2000,
                max_value=2100,
                value=py,
                step=1,
                key="commission_year",
            )
            month = st.selectbox(
                "Měsíc",
                options=list(range(1, 13)),
                format_func=lambda m: f"{m:02d}",
                index=pm - 1,
                key="commission_month",
            )

            env_md = pd_cfg.deal_month_date_field
            _md_keys = [MONTH_DATE_MODE_AUTO, MONTH_DATE_MODE_WON, MONTH_DATE_MODE_CLOSE]
            _md_idx = _md_keys.index(env_md) if env_md in _md_keys else 0
            month_date_mode = st.selectbox(
                "Měsíc dealu podle data",
                options=_md_keys,
                format_func=lambda k: _MONTH_MODE_LABELS[k],
                index=_md_idx,
                key="commission_month_date_mode",
                help="Když počty nesedí s reportem v Pipedrive, zkus **close_time** nebo ponech **auto**.",
            )
            compute = st.form_submit_button("Spočítat provize", type="primary")

        st.subheader("Provizní pravidla")
        for i, rule in enumerate(COMMISSION_RULES, start=1):
            cats = ", ".join(rule["categories"])
            if rule.get("interactive_kind"):
                st.caption(
                    f"{i}. **{cats}** — název pipeline obsahuje **{rule['interactive_kind']}** — "
                    f"**{rule['rate'] * 100:.0f} %**"
                )
            else:
                pl = rule["pipeline"] or "(jakýkoliv pipeline)"
                st.caption(f"{i}. **{cats}** — {pl} — **{rule['rate'] * 100:.0f} %**")

    missing = pd_cfg.missing_env_names()

    if missing:
        st.warning(
            "Chybí proměnné prostředí: **"
            + "**, **".join(missing)
            + "**. Zkopíruj `.env.example` na `.env` a doplň hodnoty. "
            "Klíč pole kategorie zjistíš přes `python scripts/setup_pipedrive_fields.py`."
        )
        return

    if compute:
        try:
            client = get_pipedrive_client(domain, token)
            with st.spinner("Načítám data z Pipedrive…"):
                deals, pl_map, u_map, opt_map = _fetch_context(client, cat_key)
            if not opt_map:
                st.warning(
                    "Pro zadaný klíč pole kategorie se v Pipedrive **nenašly žádné option mapy** "
                    "(špatný `key` pole?). ID hodnot z dealů se pak nepřevádí na názvy — ověř klíč v Nastavení."
                )
            y, m = int(year), int(month)
            rows = compute_commissions_for_month(
                deals,
                pl_map,
                u_map,
                cat_key,
                opt_map,
                y,
                m,
                month_date_mode=month_date_mode,
            )
            st.session_state.commission_rows = rows
            st.session_state.commission_meta = {
                "year": y,
                "month": m,
                "month_date_mode": month_date_mode,
            }
            st.session_state.value_diagnostics = build_value_diagnostics(
                deals,
                y,
                m,
                cat_key,
                opt_map,
                pl_map,
                rows,
                month_date_mode=month_date_mode,
            )
            won_m = collect_won_deals_in_month(deals, y, m, month_date_mode)
            st.session_state.csv_export_context = {
                "won_month_deals": won_m,
                "category_field_key": cat_key,
                "option_map": opt_map,
                "pipelines_map": pl_map,
                "user_map": u_map,
                "month_date_mode": month_date_mode,
            }
        except Exception as e:
            st.error(f"Chyba API nebo výpočtu: {e}")
            st.session_state.commission_rows = None
            st.session_state.commission_meta = None
            st.session_state.value_diagnostics = None
            st.session_state.csv_export_context = None

    meta = st.session_state.commission_meta
    if meta is None:
        st.info(
            "V levém panelu nastav období a klikni **Spočítat provize** — při úpravě roku nebo měsíce "
            "se stránka záměrně nepřepočítává při každém kliknutí (plynulejší UI)."
        )
        return

    rows: List[DealCommissionRow] = st.session_state.commission_rows or []
    y, m = meta["year"], meta["month"]
    month_date_mode = meta.get("month_date_mode") or MONTH_DATE_MODE_AUTO
    last_day = monthrange(y, m)[1]
    mode_txt = _MONTH_MODE_LABELS.get(month_date_mode, month_date_mode)
    st.caption(
        f"Měsíc **{y}-{m:02d}** (1.–{last_day}.), datum dealu: **{mode_txt}**. "
        "Nesedí-li počty s Pipedrive, otevři **Diagnostika** níže."
    )

    diag_early = st.session_state.get("value_diagnostics") or {}
    won_in_m = int(diag_early.get("won_deals_in_month") or 0)
    excluded_n = int(diag_early.get("excluded_count") or max(0, won_in_m - len(rows)))

    total_deals = len(rows)
    total_value = sum(r.value for r in rows)
    total_comm = sum(r.commission for r in rows)
    unique_owners = len({r.owner_name for r in rows})
    currencies_in_rows = {r.currency or "—" for r in rows}

    m1, m2, m3, m4 = st.columns(4)
    m1.metric(
        "Celkové provize",
        _fmt_money(total_comm),
        help="Součet provizí u všech započtených dealů (pro kontrolu faktur).",
    )
    m2.metric(
        "Hodnota započtených dealů",
        _fmt_money(total_value),
        help="Součet pole value z API. Při více měnách není jedna měna.",
    )
    m3.metric("Započtené dealy", _fmt_int(total_deals))
    m4.metric("Obchodníci", _fmt_int(unique_owners))

    if won_in_m > len(rows):
        st.caption(
            f"Won v měsíci: **{won_in_m}**, v provizích: **{len(rows)}**, mimo pravidla: **{excluded_n}** — detail v Diagnostice a v CSV."
        )

    if len(currencies_in_rows) > 1:
        st.warning(
            "V datech jsou **různé měny** ("
            + ", ".join(sorted(currencies_in_rows))
            + "). Součty v Kč/EUR nesčítej do jedné částky — použij tabulky v Diagnostice."
        )

    st.subheader("Souhrn po obchodnících")
    agg = aggregate_by_owner(rows)
    df_agg = pd.DataFrame(agg)
    if not df_agg.empty:
        df_agg = df_agg.copy()
        df_agg["hodnota_dealů"] = df_agg["hodnota_dealů"].map(_fmt_money)
        df_agg["provize_celkem"] = df_agg["provize_celkem"].map(_fmt_money)
    st.dataframe(df_agg, width="stretch", hide_index=True)

    st.subheader("Grafy — provize podle kategorie")
    st.caption(
        "Skládané sloupce: nejdřív **kdo** z čeho má provizi, potom **kategorie** rozložená podle typu pipeline."
    )
    df_oc = dataframe_commission_by_owner_and_category(rows)
    if df_oc.empty:
        st.info("Žádné započtené dealy pro grafy.")
    else:
        st.markdown("##### Obchodník × product category")
        st.altair_chart(_chart_owner_category(df_oc), width="stretch")

        df_cp = dataframe_commission_by_category_and_pipeline_bucket(rows)
        st.markdown("##### Product category × pipeline (zjednodušeno)")
        st.altair_chart(_chart_category_pipeline(df_cp), width="stretch")

    diag = st.session_state.get("value_diagnostics")
    if diag:
        with st.expander(
            "Diagnostika a neshody s Pipedrive",
            expanded=bool((diag.get("excluded_count") or 0) > 0),
        ):
            st.markdown(
                "Započítávají se jen dealy s pravidly v sidebaru (kategorie + pipeline). "
                "Hodnota = pole **value** z API, měsíc = volba **won_time / close_time / auto**. "
                "Token vidí jen dealy v rozsahu oprávnění uživatele."
            )
            st.caption(f"Režim data: **{diag.get('month_date_mode', '')}**")
            st.markdown("##### Won dealy v měsíci — součet value po měnách")
            st.write(f"Počet: **{diag['won_deals_in_month']}**")
            tbl_won = [
                {"měna": ccy, "součet_hodnot": _fmt_money(v)}
                for ccy, v in sorted(diag["sum_by_currency_won_month"].items())
            ]
            st.dataframe(pd.DataFrame(tbl_won), width="stretch", hide_index=True)

            st.markdown("##### Započtené dealy — součet hodnot po měnách")
            tbl_c = [
                {"měna": ccy, "součet_hodnot": _fmt_money(v)}
                for ccy, v in sorted(diag["sum_by_currency_commissioned"].items())
            ]
            st.dataframe(pd.DataFrame(tbl_c), width="stretch", hide_index=True)

            excl = int(diag.get("excluded_count") or 0)
            if excl > 0:
                st.markdown(f"##### Vyřazené z provizí v měsíci (**{excl}**)")
                st.markdown("**Product category:**")
                df_ebc = pd.DataFrame(diag.get("excluded_by_category") or [])
                if not df_ebc.empty:
                    st.dataframe(df_ebc, width="stretch", hide_index=True)
                st.markdown("**Pipeline:**")
                df_ebp = pd.DataFrame(diag.get("excluded_by_pipeline") or [])
                if not df_ebp.empty:
                    st.dataframe(df_ebp, width="stretch", hide_index=True)
                samples = diag.get("excluded_samples") or []
                st.markdown("**Ukázka:**")
                st.dataframe(pd.DataFrame(samples), width="stretch", hide_index=True)
                if excl > len(samples):
                    st.caption(f"Prvních {len(samples)} z {excl}.")
            else:
                st.success("Všechny won dealy v měsíci jsou v provizích.")

            oth = int(diag.get("other_won_count") or 0)
            st.markdown(f"##### Won mimo tento měsíc (**{oth}**) — podle Product category")
            df_oth = pd.DataFrame(diag.get("other_won_by_category") or [])
            if not df_oth.empty:
                st.dataframe(df_oth, width="stretch", hide_index=True)
            elif oth == 0:
                st.caption("Žádné.")

    with st.expander("Detail dealů", expanded=False):
        by_owner: Dict[str, List[DealCommissionRow]] = {}
        for r in rows:
            k = r.owner_name or "Neznámý"
            by_owner.setdefault(k, []).append(r)

        for owner in sorted(by_owner.keys(), key=lambda x: (-sum(d.commission for d in by_owner[x]), x)):
            deal_list = by_owner[owner]
            total_o = sum(d.commission for d in deal_list)
            with st.expander(f"{owner} — {len(deal_list)} dealů, provize {_fmt_money(total_o)}"):
                detail = [
                    {
                        "název_dealu": d.title,
                        "organizace": d.org_name,
                        "kategorie": d.category_display,
                        "pipeline": d.pipeline_name,
                        "měna": d.currency or "—",
                        "hodnota": _fmt_money(d.value),
                        "sazba": f"{d.rate * 100:.0f} %",
                        "provize": _fmt_money(d.commission),
                        "datum_won": d.won_date.isoformat() if d.won_date else "",
                    }
                    for d in sorted(deal_list, key=lambda x: (x.won_date or date.min, x.deal_id))
                ]
                st.dataframe(pd.DataFrame(detail), width="stretch", hide_index=True)

    with st.expander("Export CSV", expanded=False):
        ctx = st.session_state.get("csv_export_context")
        if ctx and ctx.get("won_month_deals") is not None:
            md_csv = ctx.get("month_date_mode") or pd_cfg.deal_month_date_field
            export_all = build_full_month_export_rows(
                ctx["won_month_deals"],
                rows,
                ctx["category_field_key"],
                ctx["option_map"],
                ctx["pipelines_map"],
                ctx["user_map"],
                month_date_mode=md_csv,
            )
            n_all = len(export_all)
            n_yes = sum(1 for r in export_all if r.get("započteno_do_provize") == "ano")
            st.caption(
                f"**{n_all}** řádků (won v měsíci), **{n_yes}** započtených. U nezapočtených sloupec důvod_vyřazení."
            )
            df_all = pd.DataFrame(export_all)
            buf_all = io.StringIO()
            df_all.to_csv(buf_all, index=False, encoding="utf-8")
            st.download_button(
                label=f"CSV — všechny won v měsíci ({n_all})",
                data=buf_all.getvalue().encode("utf-8"),
                file_name=f"provize_{y}_{m:02d}_vsechny_won.csv",
                mime="text/csv; charset=utf-8",
            )
        else:
            st.warning("Znovu klikni na **Spočítat provize**.")

        export_comm = rows_to_dataframe_rows(rows)
        df_comm = pd.DataFrame(export_comm)
        buf_comm = io.StringIO()
        df_comm.to_csv(buf_comm, index=False, encoding="utf-8")
        st.download_button(
            label=f"CSV — jen započtené ({len(rows)})",
            data=buf_comm.getvalue().encode("utf-8"),
            file_name=f"provize_{y}_{m:02d}_jen_zapoctene.csv",
            mime="text/csv; charset=utf-8",
        )


main()
