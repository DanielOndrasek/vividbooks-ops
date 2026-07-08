"""Provizní pravidla — rozšiřitelný seznam dictů."""

from typing import Dict, Optional

# Kategorie v pravidlech odpovídají hodnotám custom pole Product category u dealu
# (výchozí field key v vividbooks_ops.settings.DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY).
# Data: jen won dealy (API status=won), měsíc podle won_time/close_time — viz nástroj Provize.

# Příklady názvů z Pipedrive (logika párování je v commission.logic.interactive_pipeline_kind).
PIPELINE_INTERACTIVE_UPSELL = "CZ Sales - Upsell [CZ1]"
PIPELINE_INTERACTIVE_AKVIZICE = "CZ Sales - Akvizice [CZ1]"

# Stejné pipeline + sazby jako u interactive; v UI se sčítají do stejných bloků jako interactive.
CATEGORIES_SHARED_INTERACTIVE_PIPELINES = ("interactive", "vividboard")

# Pipedrive `pipeline_id` dealu → upsell | akvizice (Vividbooks). Má přednost před hledáním v názvu pipeline.
PIPELINE_ID_TO_INTERACTIVE_KIND: Dict[int, str] = {
    6: "akvizice",  # CZ Sales - Akvizice
    7: "upsell",  # CZ Upsell
    13: "akvizice",  # SK akvizice
    14: "upsell",  # SK upsell
}

# U interactive/vividboard: pokud nejde určit pipeline (neznámé ID + nerozpoznatelný název),
# použije se tento druh pro párování pravidla. None = deal se vyřadí (striktní režim).
INTERACTIVE_PIPELINE_FALLBACK_KIND: Optional[str] = "upsell"

COMMISSION_RULES = [
    {"categories": ["print", "posters"], "pipeline": None, "rate": 0.10},
    # interactive + vividboard: typ pipeline (upsell / akvizice) z PIPELINE_ID_TO_INTERACTIVE_KIND nebo z názvu
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "upsell", "rate": 0.10},
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "akvizice", "rate": 0.15},
]

# Pipedrive pipeline_id SK pipelines: 13 = SK Sales - Akvizície [SK1], 14 = SK Sales - Upsell [SK2].
SK_PIPELINE_IDS = (13, 14)

# Výjimky ze sazby pro konkrétního obchodníka: přepíší `rate` z COMMISSION_RULES,
# pokud deal patří obchodníkovi (shoda owner_id NEBO jména) a je v jedné z pipeline_ids.
COMMISSION_OWNER_OVERRIDES = [
    # Eduard Malachovský: 50 % ze všech SK obchodů (všechny kategorie na SK pipelines).
    {
        "owner_ids": [12797715],
        "owner_names": ["Eduard Malachovský", "Eduard Malachovsky"],
        "pipeline_ids": list(SK_PIPELINE_IDS),
        "rate": 0.50,
    },
]


def _normalize_owner_name(s: str) -> str:
    """Shoda jmen: mezery, velikost písmen, Unicode (stejně jako TS verze)."""
    import unicodedata

    return " ".join(unicodedata.normalize("NFKC", (s or "").strip()).lower().split())


def find_commission_owner_override(owner_id, owner_name, pipeline_id):
    """Vrátí override dict, pokud pro obchodníka a pipeline existuje, jinak None."""
    if pipeline_id is None:
        return None
    name_norm = _normalize_owner_name(owner_name or "")
    for o in COMMISSION_OWNER_OVERRIDES:
        if pipeline_id not in o["pipeline_ids"]:
            continue
        id_match = owner_id is not None and owner_id in o["owner_ids"]
        name_match = bool(name_norm) and any(
            _normalize_owner_name(n) == name_norm for n in o["owner_names"]
        )
        if id_match or name_match:
            return o
    return None
