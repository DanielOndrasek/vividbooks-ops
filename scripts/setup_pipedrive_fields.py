#!/usr/bin/env python3
"""Výpis deal fieldů a pipeline pro nastavení PIPEDRIVE_CATEGORY_FIELD_KEY."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

_root = Path(__file__).resolve().parents[1]
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from dotenv import load_dotenv

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient


def _is_custom_deal_field(f: Dict[str, Any]) -> bool:
    """Pipedrive: edit_flag true = uživatelské (custom) pole, false = výchozí."""
    return f.get("edit_flag") is True


def _print_custom_deal_fields(fields: List[Dict[str, Any]]) -> None:
    custom = [f for f in fields if _is_custom_deal_field(f)]
    print("=== Vlastní pole obchodů (custom deal fields, edit_flag=true) ===\n")
    if not custom:
        print("  (žádná — zkontroluj odpověď API, zda obsahuje edit_flag)\n")
        return
    for f in sorted(custom, key=lambda x: (x.get("name") or "", x.get("key") or "")):
        fid = f.get("id")
        key = f.get("key")
        name = f.get("name")
        ftype = f.get("field_type")
        print(f"  id={fid}\tkey={key}\t{name}\tfield_type={ftype}")
        opts = f.get("options") or []
        if opts:
            for o in opts:
                print(f"      option id={o.get('id')!r} label={o.get('label')!r}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--custom-only",
        action="store_true",
        help="Vypíše jen vlastní deal fieldy (id, key, název, typ, volby) a skončí.",
    )
    args = parser.parse_args()

    load_dotenv()
    token = os.getenv("PIPEDRIVE_API_TOKEN", "").strip()
    domain = os.getenv("PIPEDRIVE_DOMAIN", "").strip()
    if not token or not domain:
        print("Chybí PIPEDRIVE_API_TOKEN nebo PIPEDRIVE_DOMAIN v .env", file=sys.stderr)
        sys.exit(1)

    client = PipedriveClient(domain, token)

    try:
        fields = client.get_deal_fields()
    except Exception as e:
        print(f"Chyba při načtení dealFields: {e}", file=sys.stderr)
        sys.exit(1)

    _print_custom_deal_fields(fields)
    if args.custom_only:
        return

    print("=== Všechna pole obchodů (key, name, field_type) ===\n")

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
