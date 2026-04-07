"""Provizní pravidla — rozšiřitelný seznam dictů."""

from typing import Dict

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

COMMISSION_RULES = [
    {"categories": ["print", "posters"], "pipeline": None, "rate": 0.10},
    # interactive + vividboard: typ pipeline (upsell / akvizice) z PIPELINE_ID_TO_INTERACTIVE_KIND nebo z názvu
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "upsell", "rate": 0.10},
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "akvizice", "rate": 0.15},
]
