"""Pipedrive API klient."""

from vividbooks_ops.integrations.pipedrive.client import PipedriveClient
from vividbooks_ops.settings import PipedriveSettings


def client_from_settings(s: PipedriveSettings) -> PipedriveClient:
    return PipedriveClient(s.domain, s.api_token)
