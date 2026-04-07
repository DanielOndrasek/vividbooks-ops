"""Klient pro Pipedrive REST API v1 — stránkování a throttle."""

from __future__ import annotations

import time
from typing import Any, Dict, Iterator, List, Optional

import requests


class PipedriveClient:
    def __init__(self, domain: str, api_token: str) -> None:
        domain = domain.strip().rstrip("/")
        if domain.endswith(".pipedrive.com"):
            domain = domain.replace(".pipedrive.com", "")
        self._base = f"https://{domain}.pipedrive.com/api/v1"
        self._api_token = api_token
        self._last_request_ts = 0.0

    def _throttle(self) -> None:
        now = time.monotonic()
        wait = 0.05 - (now - self._last_request_ts)
        if wait > 0:
            time.sleep(wait)

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        self._throttle()
        q: Dict[str, Any] = dict(params or {})
        q["api_token"] = self._api_token
        url = f"{self._base}{path}" if path.startswith("/") else f"{self._base}/{path}"
        resp = requests.get(url, params=q, timeout=120)
        self._last_request_ts = time.monotonic()
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success", True):
            err = body.get("error") or body.get("error_info") or str(body)
            raise RuntimeError(f"Pipedrive API error: {err}")
        return body

    def iter_paginated(
        self,
        path: str,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Iterator[Dict[str, Any]]:
        start = 0
        limit = 500
        while True:
            params: Dict[str, Any] = {"start": start, "limit": limit}
            if extra_params:
                params.update(extra_params)
            data = self._get(path, params)
            items = data.get("data")
            if not items:
                break
            for item in items:
                yield item
            pag = (data.get("additional_data") or {}).get("pagination") or {}
            if not pag.get("more_items_in_collection"):
                break
            ns = pag.get("next_start", start + len(items))
            try:
                start = int(ns)
            except (TypeError, ValueError):
                start = start + len(items)

    def get_all_won_deals(self) -> List[Dict[str, Any]]:
        return list(self.iter_paginated("/deals", {"status": "won"}))

    def get_deal_fields(self) -> List[Dict[str, Any]]:
        data = self._get("/dealFields")
        return data.get("data") or []

    def get_pipelines(self) -> List[Dict[str, Any]]:
        data = self._get("/pipelines")
        return data.get("data") or []

    def get_users(self) -> List[Dict[str, Any]]:
        return list(self.iter_paginated("/users"))
