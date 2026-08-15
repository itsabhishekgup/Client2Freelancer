"""Shared pytest fixtures. Adds the backend dir to sys.path so tests can
`import main` without triggering any real RPC network calls at import time
(Web3 provider creation is lazy)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    """TestClient WITHOUT context-manager startup: the app's lifespan (which
    would hit the real RPC and start the poller) never runs, so tests stay
    offline and deterministic."""
    import main

    return TestClient(main.app)
