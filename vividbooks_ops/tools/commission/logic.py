"""Výpočet provizí z won dealů a mapování polí."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from vividbooks_ops.tools.commission.month_mode import (
    MONTH_DATE_MODE_AUTO,
    MONTH_DATE_MODE_CLOSE,
    MONTH_DATE_MODE_WON,
    normalize_month_date_mode,
)
from vividbooks_ops.tools.commission.rules import (
    CATEGORIES_SHARED_INTERACTIVE_PIPELINES,
    COMMISSION_RULES,
)


def parse_won_date(won_time: Optional[str]) -> Optional[date]:
    if not won_time:
        return None
    s = str(won_time)[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def deal_raw_timestamp_for_month(deal: Dict[str, Any], mode: str) -> str:
    """Řetězec data/času z API pro zařazení do měsíce (prvních 10 znaků = datum)."""
    wt = deal.get("won_time")
    ct = deal.get("close_time")
    if mode == MONTH_DATE_MODE_CLOSE:
        s = ct
    elif mode == MONTH_DATE_MODE_WON:
        s = wt
    else:
        if wt is not None and str(wt).strip():
            s = wt
        else:
            s = ct
    if s is None:
        return ""
    return str(s).strip()


def deal_month_date(deal: Dict[str, Any], mode: str) -> Optional[date]:
    raw = deal_raw_timestamp_for_month(deal, mode)
    return parse_won_date(raw) if raw else None


def extract_user_id(deal: Dict[str, Any]) -> Optional[int]:
    u = deal.get("user_id")
    if u is None:
        return None
    if isinstance(u, dict):
        uid = u.get("id")
        return int(uid) if uid is not None else None
    try:
        return int(u)
    except (TypeError, ValueError):
        return None


def extract_user_name_from_deal(deal: Dict[str, Any]) -> Optional[str]:
    u = deal.get("user_id")
    if isinstance(u, dict) and u.get("name"):
        return str(u["name"])
    return None


def deal_owner_display(deal: Dict[str, Any], user_id_to_name: Dict[int, str]) -> str:
    n = extract_user_name_from_deal(deal)
    if n:
        return n
    uid = extract_user_id(deal)
    if uid is not None and uid in user_id_to_name:
        return user_id_to_name[uid]
    if uid is not None:
        return f"User #{uid}"
    return ""


def extract_org_name(deal: Dict[str, Any]) -> str:
    o = deal.get("org_id")
    if o is None:
        return ""
    if isinstance(o, dict):
        return str(o.get("name") or "")
    return ""


def deal_monetary_value(deal: Dict[str, Any]) -> float:
    """Hodnota z pole `value` (Pipedrive — částka v měně dealu, viz `currency`)."""
    v = deal.get("value")
    if v is None:
        return 0.0
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def deal_currency(deal: Dict[str, Any]) -> str:
    c = deal.get("currency")
    if c is None or c == "":
        return ""
    return str(c).strip().upper()


def _register_option_keys(out: Dict[str, str], oid: Any, label: str) -> None:
    """Pipedrive vrací id jako int/float/str — mapujeme všechny běžné tvary na stejný label."""
    if oid is None:
        return
    s = str(oid).strip()
    if not s:
        return
    out[s] = label
    try:
        f = float(s)
        if f == int(f):
            out[str(int(f))] = label
    except (TypeError, ValueError, OverflowError):
        pass


def build_category_option_map(
    deal_fields: List[Dict[str, Any]],
    category_field_key: str,
) -> Dict[str, str]:
    """Mapuje option ID (string) → label pro enum/set pole kategorie."""
    for field in deal_fields:
        if field.get("key") != category_field_key:
            continue
        out: Dict[str, str] = {}
        for opt in field.get("options") or []:
            oid = opt.get("id")
            label = opt.get("label")
            if oid is not None and label is not None:
                _register_option_keys(out, oid, str(label))
        return out
    return {}


def _resolve_label_from_option_map(
    raw: Any,
    option_id_to_label: Dict[str, str],
) -> Optional[str]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        if not raw:
            return None
        raw = raw[0]
    key = str(raw).strip()
    if not key:
        return None
    if key in option_id_to_label:
        return option_id_to_label[key]
    try:
        f = float(key)
        if f == int(f):
            k2 = str(int(f))
            if k2 in option_id_to_label:
                return option_id_to_label[k2]
    except (TypeError, ValueError, OverflowError):
        pass
    return None


def normalize_category_label(
    raw: Any,
    option_id_to_label: Dict[str, str],
) -> Optional[str]:
    if raw is None or raw == "":
        return None
    if isinstance(raw, list):
        if not raw:
            return None
        raw = raw[0]
    key = str(raw).strip()
    label = _resolve_label_from_option_map(raw, option_id_to_label)
    text = label if label is not None else key
    out = text.lower().strip()
    return out if out else None


def category_label_matches_rule_categories(
    category_label: str,
    rule_categories: List[str],
) -> bool:
    """
    Pipedrive label často není přesně „interactive“, ale „Interactive“ nebo „interactive + vividboard“.
    Pravidla používají krátké klíče — povolíme shodu celého řetězce, tokenu nebo zkomprimovaného textu.
    """
    cat = (category_label or "").lower().strip()
    if not cat:
        return False
    cats_norm = [c.lower().strip() for c in rule_categories if c]
    if cat in cats_norm:
        return True
    cat_c = cat.replace(" ", "").replace("-", "").replace("_", "")
    for c in cats_norm:
        if cat_c == c.replace(" ", "").replace("-", "").replace("_", ""):
            return True
        if cat.startswith(c + " ") or cat.startswith(c + "-") or cat.startswith(c + "/"):
            return True
    parts = [p for p in re.split(r"[\s,/;|+]+", cat) if p]
    if any(p in cats_norm for p in parts):
        return True
    return False


def normalize_pipeline_name(name: str) -> str:
    """Sjednocení mezer a velikosti písmen pro spolehlivé párování s Pipedrive."""
    if not name:
        return ""
    n = unicodedata.normalize("NFKC", str(name))
    return " ".join(n.strip().casefold().split())


def pipelines_equal(a: str, b: str) -> bool:
    return normalize_pipeline_name(a) == normalize_pipeline_name(b)


def interactive_pipeline_kind(pipeline_name: str) -> Optional[str]:
    """
    Rozlišení Upsell vs Akvizice podle názvu pipeline z Pipedrive.
    Pokrývá CZ Sales - Upsell [CZ1/CZ2], SK Sales - Upsell [SK2], Akvizice [CZ1], atd.
    """
    n = normalize_pipeline_name(pipeline_name)
    if not n:
        return None
    if "akvizice" in n:
        return "akvizice"
    if "acquisition" in n:
        return "akvizice"
    # „ - upsell“ odfiltruje náhodné řetězce jako „pre-upsell“ bez mezer kolem slova v názvu PD
    if " - upsell" in n or n.endswith(" upsell"):
        return "upsell"
    # „CZ Sales Upsell [CZ1]“ — mezera před „upsell“, ne nutně „ - upsell“
    if " upsell" in n:
        return "upsell"
    return None


def pipeline_id_to_name(
    deal: Dict[str, Any],
    pipelines_map: Dict[int, str],
) -> str:
    pid = deal.get("pipeline_id")
    if pid is None:
        return ""
    try:
        i = int(pid)
    except (TypeError, ValueError):
        return ""
    return pipelines_map.get(i, "")


def find_commission_rule(
    category_label: str,
    pipeline_name: str,
) -> Optional[Dict[str, Any]]:
    for rule in COMMISSION_RULES:
        cats = list(rule["categories"])
        if not category_label_matches_rule_categories(category_label, cats):
            continue
        ikind = rule.get("interactive_kind")
        if ikind:
            if interactive_pipeline_kind(pipeline_name) == ikind:
                return rule
            continue
        p = rule["pipeline"]
        if p is None:
            return rule
        if pipelines_equal(pipeline_name, str(p)):
            return rule
    return None


@dataclass
class DealCommissionRow:
    deal_id: int
    title: str
    org_name: str
    owner_id: Optional[int]
    owner_name: str
    category_label: str
    category_display: str
    pipeline_name: str
    currency: str
    value: float
    rate: float
    commission: float
    won_date: Optional[date]
    won_time_raw: str


def _segment_base_category(label: str) -> str:
    """Z normalizovaného labelu (může být delší než klíč v pravidlech) odvodí základ pro segmentaci."""
    cl = (label or "").lower().strip()
    if not cl:
        return ""
    if cl == "print" or cl.startswith("print ") or cl.startswith("print-"):
        return "print"
    if cl == "posters" or cl.startswith("posters ") or cl.startswith("posters-"):
        return "posters"
    parts = [p for p in re.split(r"[\s,/;|+]+", cl) if p]
    for token in parts:
        if token in CATEGORIES_SHARED_INTERACTIVE_PIPELINES:
            return token
    for c in CATEGORIES_SHARED_INTERACTIVE_PIPELINES:
        if cl.startswith(c + " ") or cl.startswith(c + "-") or cl == c:
            return c
    return cl


def row_reporting_segment(r: DealCommissionRow) -> str:
    """Skupina pro přehledy v UI / CSV."""
    base = _segment_base_category(r.category_label)
    if base == "print":
        return "print"
    if base == "posters":
        return "posters"
    if base in CATEGORIES_SHARED_INTERACTIVE_PIPELINES:
        kind = interactive_pipeline_kind(r.pipeline_name)
        if kind == "akvizice":
            return "interactive_akvizice"
        if kind == "upsell":
            return "interactive_upsell"
    return "ostatní"


def compute_commissions_for_month(
    deals: List[Dict[str, Any]],
    pipelines_map: Dict[int, str],
    user_id_to_name: Dict[int, str],
    category_field_key: str,
    option_id_to_label: Dict[str, str],
    year: int,
    month: int,
    month_date_mode: str = MONTH_DATE_MODE_AUTO,
) -> List[DealCommissionRow]:
    rows: List[DealCommissionRow] = []
    for deal in deals:
        won_d = deal_month_date(deal, month_date_mode)
        if won_d is None or won_d.year != year or won_d.month != month:
            continue
        anchor_raw = deal_raw_timestamp_for_month(deal, month_date_mode)

        raw_cat = deal.get(category_field_key)
        if isinstance(raw_cat, list):
            raw_for_id = raw_cat[0] if raw_cat else None
        else:
            raw_for_id = raw_cat
        cat_norm = normalize_category_label(raw_cat, option_id_to_label)
        if not cat_norm:
            continue
        rid = str(raw_for_id).strip() if raw_for_id is not None else ""
        cat_display = option_id_to_label.get(
            rid,
            str(raw_for_id).strip() if raw_for_id is not None else cat_norm,
        )

        pl_name = pipeline_id_to_name(deal, pipelines_map)
        rule = find_commission_rule(cat_norm, pl_name)
        if rule is None:
            continue

        value = deal_monetary_value(deal)
        rate = float(rule["rate"])
        commission = value * rate
        ccy = deal_currency(deal)

        uid = extract_user_id(deal)
        owner_name = extract_user_name_from_deal(deal) or (
            user_id_to_name.get(uid, "") if uid is not None else ""
        )
        if not owner_name and uid is not None:
            owner_name = f"User #{uid}"

        did = deal.get("id")
        try:
            deal_id = int(did) if did is not None else 0
        except (TypeError, ValueError):
            deal_id = 0

        title = str(deal.get("title") or "")
        won_str = anchor_raw

        rows.append(
            DealCommissionRow(
                deal_id=deal_id,
                title=title,
                org_name=extract_org_name(deal),
                owner_id=uid,
                owner_name=owner_name,
                category_label=cat_norm,
                category_display=cat_display,
                pipeline_name=pl_name,
                currency=ccy,
                value=value,
                rate=rate,
                commission=commission,
                won_date=won_d,
                won_time_raw=won_str,
            )
        )

    rows.sort(key=lambda r: (r.owner_name or "", r.deal_id))
    return rows


def collect_won_deals_in_month(
    deals: List[Dict[str, Any]],
    year: int,
    month: int,
    month_date_mode: str = MONTH_DATE_MODE_AUTO,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for deal in deals:
        won_d = deal_month_date(deal, month_date_mode)
        if won_d is None or won_d.year != year or won_d.month != month:
            continue
        out.append(deal)
    return out


def sum_values_by_currency(deals: List[Dict[str, Any]]) -> Dict[str, float]:
    acc: Dict[str, float] = {}
    for deal in deals:
        ccy = deal_currency(deal) or "—"
        acc[ccy] = acc.get(ccy, 0.0) + deal_monetary_value(deal)
    return acc


def _deal_category_display_for_exclusion(
    deal: Dict[str, Any],
    category_field_key: str,
    option_id_to_label: Dict[str, str],
) -> str:
    raw_cat = deal.get(category_field_key)
    if isinstance(raw_cat, list):
        raw_for_id = raw_cat[0] if raw_cat else None
    else:
        raw_for_id = raw_cat
    rid = str(raw_for_id).strip() if raw_for_id is not None else ""
    cat_norm = normalize_category_label(raw_cat, option_id_to_label)
    if not cat_norm:
        return ""
    return option_id_to_label.get(
        rid,
        str(raw_for_id).strip() if raw_for_id is not None else cat_norm,
    )


def deal_category_display_raw(
    deal: Dict[str, Any],
    category_field_key: str,
    option_id_to_label: Dict[str, str],
) -> str:
    """Text kategorie pro export (label z enumu nebo surová hodnota)."""
    disp = _deal_category_display_for_exclusion(deal, category_field_key, option_id_to_label)
    if disp:
        return disp
    raw_cat = deal.get(category_field_key)
    if raw_cat is None or raw_cat == "":
        return ""
    if isinstance(raw_cat, list):
        return ", ".join(str(x) for x in raw_cat) if raw_cat else ""
    return str(raw_cat).strip()


def exclusion_reason(
    deal: Dict[str, Any],
    category_field_key: str,
    option_id_to_label: Dict[str, str],
    pipelines_map: Dict[int, str],
) -> str:
    raw_cat = deal.get(category_field_key)
    cat_norm = normalize_category_label(raw_cat, option_id_to_label)
    if not cat_norm:
        return "chybí Product category (prázdné nebo nerozpoznané)"
    pl_name = pipeline_id_to_name(deal, pipelines_map)
    if find_commission_rule(cat_norm, pl_name) is None:
        disp = _deal_category_display_for_exclusion(deal, category_field_key, option_id_to_label)
        pl = pl_name or "(bez pipeline)"
        hint = ""
        if cat_norm in CATEGORIES_SHARED_INTERACTIVE_PIPELINES and not interactive_pipeline_kind(
            pl_name
        ):
            hint = " — v názvu pipeline chybí rozpoznatelný úsek „ - upsell“ nebo „akvizice“"
        return f'žádné pravidlo pro „{disp or cat_norm}“ + pipeline „{pl}“{hint}'
    return ""


def build_value_diagnostics(
    deals: List[Dict[str, Any]],
    year: int,
    month: int,
    category_field_key: str,
    option_id_to_label: Dict[str, str],
    pipelines_map: Dict[int, str],
    rows: List[DealCommissionRow],
    month_date_mode: str = MONTH_DATE_MODE_AUTO,
    max_excluded_rows: int = 100,
) -> Dict[str, Any]:
    """
    Vysvětlení rozdílů součtu: všechny won dealy v měsíci vs. jen započtené,
    součty po měnách (value je vždy v měně dealu).
    """
    won_month = collect_won_deals_in_month(deals, year, month, month_date_mode)
    by_ccy_won = sum_values_by_currency(won_month)
    commissioned_ids = {r.deal_id for r in rows if r.deal_id}
    excluded: List[Dict[str, Any]] = []
    for d in won_month:
        try:
            did = int(d.get("id"))
        except (TypeError, ValueError):
            continue
        if did not in commissioned_ids:
            excluded.append(d)

    by_ccy_commissioned: Dict[str, float] = {}
    for r in rows:
        ccy = r.currency or "—"
        by_ccy_commissioned[ccy] = by_ccy_commissioned.get(ccy, 0.0) + r.value

    excluded_samples = []
    for d in excluded[:max_excluded_rows]:
        try:
            did = int(d.get("id"))
        except (TypeError, ValueError):
            did = 0
        excluded_samples.append(
            {
                "id_dealu": did,
                "název": str(d.get("title") or ""),
                "product_category": deal_category_display_raw(
                    d, category_field_key, option_id_to_label
                )
                or "(prázdná)",
                "hodnota": deal_monetary_value(d),
                "měna": deal_currency(d) or "—",
                "důvod_vyřazení": exclusion_reason(
                    d, category_field_key, option_id_to_label, pipelines_map
                ),
            }
        )

    excluded_by_category: Dict[str, int] = {}
    excluded_by_pipeline: Dict[str, int] = {}
    for d in excluded:
        cat_lbl = deal_category_display_raw(
            d, category_field_key, option_id_to_label
        ).strip()
        if not cat_lbl:
            cat_lbl = "(prázdná / chybí Product category)"
        excluded_by_category[cat_lbl] = excluded_by_category.get(cat_lbl, 0) + 1
        pl = pipeline_id_to_name(d, pipelines_map).strip() or "(bez názvu pipeline)"
        excluded_by_pipeline[pl] = excluded_by_pipeline.get(pl, 0) + 1

    won_month_ids: set[int] = set()
    for d in won_month:
        try:
            won_month_ids.add(int(d.get("id")))
        except (TypeError, ValueError):
            pass

    other_won: List[Dict[str, Any]] = []
    for d in deals:
        try:
            did = int(d.get("id"))
        except (TypeError, ValueError):
            continue
        if did not in won_month_ids:
            other_won.append(d)

    other_won_by_category: Dict[str, int] = {}
    for d in other_won:
        cat_lbl = deal_category_display_raw(
            d, category_field_key, option_id_to_label
        ).strip()
        if not cat_lbl:
            cat_lbl = "(prázdná / chybí Product category)"
        other_won_by_category[cat_lbl] = other_won_by_category.get(cat_lbl, 0) + 1

    def _sort_count_rows(dct: Dict[str, int], label_key: str) -> List[Dict[str, Any]]:
        return [
            {label_key: k, "počet_dealů": v}
            for k, v in sorted(dct.items(), key=lambda x: (-x[1], x[0]))
        ]

    return {
        "won_deals_in_month": len(won_month),
        "api_won_deals_loaded": len(deals),
        "month_date_mode": month_date_mode,
        "sum_by_currency_won_month": by_ccy_won,
        "commissioned_deals": len(rows),
        "sum_by_currency_commissioned": by_ccy_commissioned,
        "excluded_count": len(excluded),
        "excluded_samples": excluded_samples,
        "distinct_currencies_won": sorted(by_ccy_won.keys()),
        "excluded_by_category": _sort_count_rows(excluded_by_category, "product_category"),
        "excluded_by_pipeline": _sort_count_rows(excluded_by_pipeline, "pipeline"),
        "other_won_count": len(other_won),
        "other_won_by_category": _sort_count_rows(other_won_by_category, "product_category"),
    }


def aggregate_by_owner(rows: List[DealCommissionRow]) -> List[Dict[str, Any]]:
    by: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = r.owner_name or "Neznámý"
        if key not in by:
            by[key] = {
                "obchodník": key,
                "počet_dealů": 0,
                "hodnota_dealů": 0.0,
                "provize_celkem": 0.0,
            }
        by[key]["počet_dealů"] += 1
        by[key]["hodnota_dealů"] += r.value
        by[key]["provize_celkem"] += r.commission
    out = list(by.values())
    out.sort(key=lambda x: x["provize_celkem"], reverse=True)
    return out


def chart_pipeline_bucket_label(r: DealCommissionRow) -> str:
    """Krátký popisek pipeline pro graf kategorie × pipeline."""
    if r.category_label in ("print", "posters"):
        return "Libovolný pipeline"
    kind = interactive_pipeline_kind(r.pipeline_name)
    if kind == "upsell":
        return "Upsell (CZ/SK…)"
    if kind == "akvizice":
        return "Akvizice"
    pl = (r.pipeline_name or "").strip()
    if not pl:
        return "(bez pipeline)"
    return pl if len(pl) <= 38 else pl[:35] + "…"


def dataframe_commission_by_owner_and_category(rows: List[DealCommissionRow]) -> pd.DataFrame:
    """Agregované řádky pro skládaný graf obchodník × product category."""
    if not rows:
        return pd.DataFrame(columns=["obchodník", "product_category", "provize"])
    rec = [
        {
            "obchodník": r.owner_name or "Neznámý",
            "product_category": (r.category_display or r.category_label or "").strip() or "(bez kategorie)",
            "provize": r.commission,
        }
        for r in rows
    ]
    df = pd.DataFrame(rec)
    return df.groupby(["obchodník", "product_category"], as_index=False)["provize"].sum()


def dataframe_commission_by_category_and_pipeline_bucket(rows: List[DealCommissionRow]) -> pd.DataFrame:
    """Agregované řádky pro graf product category × zjednodušený pipeline."""
    if not rows:
        return pd.DataFrame(columns=["product_category", "pipeline_bucket", "provize"])
    rec = [
        {
            "product_category": (r.category_display or r.category_label or "").strip() or "(bez kategorie)",
            "pipeline_bucket": chart_pipeline_bucket_label(r),
            "provize": r.commission,
        }
        for r in rows
    ]
    df = pd.DataFrame(rec)
    return df.groupby(["product_category", "pipeline_bucket"], as_index=False)["provize"].sum()


def rows_to_dataframe_rows(rows: List[DealCommissionRow]) -> List[Dict[str, Any]]:
    return [
        {
            "id_dealu": r.deal_id,
            "název_dealu": r.title,
            "organizace": r.org_name,
            "obchodník": r.owner_name,
            "kategorie": r.category_display,
            "pipeline": r.pipeline_name,
            "měna": r.currency or "—",
            "hodnota": r.value,
            "sazba": r.rate,
            "provize": r.commission,
            "datum_won": r.won_date.isoformat() if r.won_date else "",
            "won_time": r.won_time_raw,
            "segment": row_reporting_segment(r),
        }
        for r in rows
    ]


def build_full_month_export_rows(
    won_month: List[Dict[str, Any]],
    commissioned: List[DealCommissionRow],
    category_field_key: str,
    option_id_to_label: Dict[str, str],
    pipelines_map: Dict[int, str],
    user_id_to_name: Dict[int, str],
    month_date_mode: str = MONTH_DATE_MODE_AUTO,
) -> List[Dict[str, Any]]:
    """
    Jeden řádek za každý won deal v měsíci (datum podle zvoleného režimu). Započtené mají provizi a segment,
    ostatní mají sloupec důvod_vyřazení (proč nejsou v provizích).
    """
    by_id = {r.deal_id: r for r in commissioned if r.deal_id}

    def sort_key(d: Dict[str, Any]) -> Tuple[str, int]:
        try:
            did = int(d.get("id"))
        except (TypeError, ValueError):
            did = 0
        return (deal_owner_display(d, user_id_to_name), did)

    out: List[Dict[str, Any]] = []
    for deal in sorted(won_month, key=sort_key):
        try:
            did = int(deal.get("id"))
        except (TypeError, ValueError):
            did = 0

        anchor_raw = deal_raw_timestamp_for_month(deal, month_date_mode)
        won_d = deal_month_date(deal, month_date_mode)
        won_date_str = won_d.isoformat() if won_d else ""

        row: Dict[str, Any] = {
            "id_dealu": did,
            "název_dealu": str(deal.get("title") or ""),
            "organizace": extract_org_name(deal),
            "obchodník": deal_owner_display(deal, user_id_to_name),
            "kategorie": deal_category_display_raw(deal, category_field_key, option_id_to_label),
            "pipeline": pipeline_id_to_name(deal, pipelines_map),
            "měna": deal_currency(deal) or "—",
            "hodnota": deal_monetary_value(deal),
            "datum_pro_měsíc": won_date_str,
            "časové_pole_pro_měsíc": anchor_raw,
            "won_time_api": str(deal.get("won_time") or ""),
            "close_time_api": str(deal.get("close_time") or ""),
        }

        if did in by_id:
            r = by_id[did]
            row["započteno_do_provize"] = "ano"
            row["sazba"] = r.rate
            row["provize"] = r.commission
            row["segment"] = row_reporting_segment(r)
            row["důvod_vyřazení"] = ""
        else:
            row["započteno_do_provize"] = "ne"
            row["sazba"] = None
            row["provize"] = None
            row["segment"] = ""
            row["důvod_vyřazení"] = exclusion_reason(
                deal, category_field_key, option_id_to_label, pipelines_map
            )
        out.append(row)
    return out


__all__ = [
    "MONTH_DATE_MODE_AUTO",
    "MONTH_DATE_MODE_CLOSE",
    "MONTH_DATE_MODE_WON",
    "DealCommissionRow",
    "aggregate_by_owner",
    "build_category_option_map",
    "build_full_month_export_rows",
    "build_value_diagnostics",
    "collect_won_deals_in_month",
    "compute_commissions_for_month",
    "dataframe_commission_by_category_and_pipeline_bucket",
    "dataframe_commission_by_owner_and_category",
    "normalize_month_date_mode",
    "rows_to_dataframe_rows",
]
