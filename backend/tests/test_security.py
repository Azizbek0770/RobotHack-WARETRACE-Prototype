from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.core import security


def test_production_rejects_operational_writes(monkeypatch):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(environment="production"),
    )

    with pytest.raises(HTTPException) as error:
        security.require_local_operational_writes()

    assert error.value.status_code == 403


@pytest.mark.parametrize("environment", ["development", "test"])
def test_local_environments_allow_operational_writes(monkeypatch, environment):
    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: SimpleNamespace(environment=environment),
    )

    security.require_local_operational_writes()
