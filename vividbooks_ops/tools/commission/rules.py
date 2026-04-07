"""Provizní pravidla — rozšiřitelný seznam dictů."""

# Kategorie v pravidlech odpovídají hodnotám custom pole Product category u dealu
# (výchozí field key v vividbooks_ops.settings.DEFAULT_PIPEDRIVE_PRODUCT_CATEGORY_FIELD_KEY).
# Data: jen won dealy (API status=won), měsíc podle won_time/close_time — viz nástroj Provize.

# Příklady názvů z Pipedrive (logika párování je v commission.logic.interactive_pipeline_kind).
PIPELINE_INTERACTIVE_UPSELL = "CZ Sales - Upsell [CZ1]"
PIPELINE_INTERACTIVE_AKVIZICE = "CZ Sales - Akvizice [CZ1]"

# Stejné pipeline + sazby jako u interactive; v UI se sčítají do stejných bloků jako interactive.
CATEGORIES_SHARED_INTERACTIVE_PIPELINES = ("interactive", "vividboard")

COMMISSION_RULES = [
    {"categories": ["print", "posters"], "pipeline": None, "rate": 0.10},
    # interactive + vividboard: pipeline musí v názvu obsahovat typ (Upsell / Akvizice) — platí CZ1, CZ2, SK2, …
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "upsell", "rate": 0.10},
    {"categories": ["interactive", "vividboard"], "pipeline": None, "interactive_kind": "akvizice", "rate": 0.15},
]
