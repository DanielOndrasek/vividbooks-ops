#!/usr/bin/env python3
"""Výpis deal fieldů a pipeline pro nastavení PIPEDRIVE_CATEGORY_FIELD_KEY."""

import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from dotenv import load_dotenv

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient


def main() -> None:
    load_dotenv()
    token = os.getenv("PIPEDRIVE_API_TOKEN", "").strip()
    domain = os.getenv("PIPEDRIVE_DOMAIN", "").strip()
    if not token or not domain:
        print("Chybí PIPEDRIVE_API_TOKEN nebo PIPEDRIVE_DOMAIN v .env", file=sys.stderr)
        sys.exit(1)

    client = PipedriveClient(domain, token)

    print("=== Deal fields (key, name, field_type) ===\n")
    try:
        fields = client.get_deal_fields()
    except Exception as e:
        print(f"Chyba při načtení dealFields: {e}", file=sys.stderr)
        sys.exit(1)

    for f in sorted(fields, key=lambda x: (x.get("name") or "", x.get("key") or "")):
        key = f.get("key")
        name = f.get("name")
        ftype = f.get("field_type")
        print(f"  {key}\t{name}\t{ftype}")
        opts = f.get("options") or []
        if opts:
            for o in opts:
                print(f"      option id={o.get('id')!r} label={o.get('label')!r}")
        print()

    print("\n=== Pipelines (id, name) ===\n")
    try:
        pipes = client.get_pipelines()
    except Exception as e:
        print(f"Chyba při načtení pipelines: {e}", file=sys.stderr)
        sys.exit(1)

    for p in sorted(pipes, key=lambda x: (x.get("name") or "", x.get("id") or 0)):
        print(f"  id={p.get('id')}\tname={p.get('name')!r}")

    print(
        "\nDo souboru .env zapiš klíč pole kategorie do proměnné "
        "PIPEDRIVE_CATEGORY_FIELD_KEY=...\n"
        "(vyber řádek z Deal fields, sloupec key — typicky enum/set s options).\n"
    )


if __name__ == "__main__":
    main()
