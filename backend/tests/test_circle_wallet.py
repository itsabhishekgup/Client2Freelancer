"""Tests for the Circle UCW integration.

Graceful-degradation tests run with the env key cleared (monkeypatch), so they
pass both locally (key present) and in CI (no key). Configured-path tests mock
the SDK so no network / real credentials are needed.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

import circle_wallet
import main

CIRCLE_ENV_KEYS = ("CIRCLE_API_KEY", "CIRCLE_ENTITY_SECRET", "CIRCLE_APP_ID")


def _clear_circle_env(monkeypatch):
    for key in CIRCLE_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def test_config_without_key(monkeypatch):
    _clear_circle_env(monkeypatch)
    cfg = circle_wallet.config()
    assert cfg["configured"] is False
    assert cfg["blockchains"] == ["ARC-TESTNET"]


def test_email_login_requires_key(monkeypatch):
    _clear_circle_env(monkeypatch)
    result = circle_wallet.email_login("test@example.com")
    assert result["ok"] is False
    assert "not configured" in result["error"]


def test_create_wallet_requires_key(monkeypatch):
    _clear_circle_env(monkeypatch)
    result = circle_wallet.create_wallet("dummy-token")
    assert result["ok"] is False
    assert "not configured" in result["error"]


def test_contract_execution_requires_key(monkeypatch):
    _clear_circle_env(monkeypatch)
    result = circle_wallet.contract_execution("t", "w", "depositFunds(uint256)", ["1"])
    assert result["ok"] is False
    assert "not configured" in result["error"]


def test_escrow_action_signature_map():
    assert circle_wallet.escrow_action_signature("deposit") == "depositFunds(uint256)"
    assert circle_wallet.escrow_action_signature("create") == "createEscrow(address,uint256)"
    assert circle_wallet.escrow_action_signature("bogus") is None


def test_config_endpoint(monkeypatch):
    _clear_circle_env(monkeypatch)
    client = TestClient(main.app)
    r = client.get("/api/circle/config")
    assert r.status_code == 200
    body = r.json()
    assert body["configured"] is False
    assert "app_id" in body


def test_login_endpoint_graceful(monkeypatch):
    _clear_circle_env(monkeypatch)
    client = TestClient(main.app)
    r = client.post("/api/circle/login", json={"email": "a@b.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "not configured" in r.json()["error"]


def test_pin_login_requires_key(monkeypatch):
    _clear_circle_env(monkeypatch)
    result = circle_wallet.pin_login("demo-user")
    assert result["ok"] is False
    assert "not configured" in result["error"]


def test_pin_login_requires_user_id(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    result = circle_wallet.pin_login("   ")
    assert result["ok"] is False
    assert "user id" in result["error"].lower()


def test_pin_login_sdk_flow(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    fake_data = MagicMock()
    fake_data.user_token = "ut-pin"
    fake_data.encryption_key = "ek-pin"
    fake_token_resp = MagicMock(data=fake_data)

    fake_api = MagicMock()
    fake_api.create_user.return_value = MagicMock()
    fake_api.get_user_token.return_value = fake_token_resp

    with patch.object(circle_wallet, "_client", return_value=MagicMock()), patch(
        "circle.web3.user_controlled_wallets.PINAuthenticationApi", return_value=fake_api
    ):
        result = circle_wallet.pin_login("demo-user")

    assert result["ok"] is True
    assert result["userToken"] == "ut-pin"
    assert result["encryptionKey"] == "ek-pin"
    assert result["userId"] == "demo-user"
    # user created before token fetched
    _, create_kwargs = fake_api.create_user.call_args
    assert create_kwargs["create_user_request"]["userId"] == "demo-user"
    _, token_kwargs = fake_api.get_user_token.call_args
    assert token_kwargs["user_token_request"]["userId"] == "demo-user"


def test_pin_login_endpoint_graceful(monkeypatch):
    _clear_circle_env(monkeypatch)
    client = TestClient(main.app)
    r = client.post("/api/circle/pin-login", json={"user_id": "demo-user"})
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "not configured" in r.json()["error"]


def test_contract_endpoint_unknown_action(monkeypatch):
    _clear_circle_env(monkeypatch)
    client = TestClient(main.app)
    r = client.post(
        "/api/circle/contract",
        json={"user_token": "t", "wallet_id": "w", "action": "nope", "args": []},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is False
    assert "Unknown escrow action" in r.json()["error"]


# --- configured-path tests (SDK mocked, no network) -------------------------


def test_email_login_sdk_flow(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    fake_data = MagicMock()
    fake_data.user_token = "ut-123"
    fake_data.encryption_key = "ek-123"
    fake_data.challenge_id = "ch-123"
    fake_resp = MagicMock(data=fake_data)

    fake_api = MagicMock()
    fake_api.create_device_token_email_login.return_value = fake_resp

    with patch.object(circle_wallet, "_client", return_value=MagicMock()), patch(
        "circle.web3.user_controlled_wallets.SocialEmailAuthenticationApi",
        return_value=fake_api,
    ):
        result = circle_wallet.email_login("  Test@Example.com  ")

    assert result["ok"] is True
    assert result["userToken"] == "ut-123"
    assert result["challengeId"] == "ch-123"
    # email normalized; deviceId + idempotencyKey auto-filled
    _, kwargs = fake_api.create_device_token_email_login.call_args
    req = kwargs["device_token_email_request"]
    assert req["email"] == "test@example.com"
    assert req["deviceId"]
    assert req["idempotencyKey"]


def test_create_wallet_sdk_flow(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    fake_data = MagicMock()
    fake_data.wallet_id = "w-1"
    fake_data.challenge_id = "ch-9"
    fake_data.wallet_set_id = "ws-1"
    fake_resp = MagicMock(data=fake_data)

    fake_api = MagicMock()
    fake_api.create_user_wallet.return_value = fake_resp

    with patch.object(circle_wallet, "_client", return_value=MagicMock()), patch(
        "circle.web3.user_controlled_wallets.WalletsApi", return_value=fake_api
    ):
        result = circle_wallet.create_wallet("ut-token")

    assert result["ok"] is True
    assert result["walletId"] == "w-1"
    _, kwargs = fake_api.create_user_wallet.call_args
    assert kwargs["x_user_token"] == "ut-token"
    assert kwargs["create_end_user_wallet_request"]["blockchains"] == ["ARC-TESTNET"]


def test_contract_execution_sdk_flow(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    fake_data = MagicMock()
    fake_data.challenge_id = "ch-tx"
    fake_resp = MagicMock(data=fake_data)

    fake_api = MagicMock()
    fake_api.create_user_transaction_contract_execution_challenge.return_value = fake_resp

    with patch.object(circle_wallet, "_client", return_value=MagicMock()), patch(
        "circle.web3.user_controlled_wallets.TransactionsApi", return_value=fake_api
    ):
        result = circle_wallet.contract_execution("ut", "w-1", "depositFunds(uint256)", ["3"])

    assert result["ok"] is True
    assert result["challengeId"] == "ch-tx"
    _, kwargs = fake_api.create_user_transaction_contract_execution_challenge.call_args
    req = kwargs["create_contract_execution_transaction_for_end_user_request"]
    assert req["walletId"] == "w-1"
    assert req["abiFunctionSignature"] == "depositFunds(uint256)"
    assert req["abiParameters"] == ["3"]


def test_list_wallets_sdk_flow(monkeypatch):
    monkeypatch.setenv("CIRCLE_API_KEY", "TEST_API_KEY:abc:def")
    fake_resp = MagicMock()
    fake_resp.data = {"wallets": [{"wallet_id": "w-1", "address": "0xabc", "blockchain": "ARC-TESTNET"}]}

    fake_api = MagicMock()
    fake_api.list_wallets.return_value = fake_resp

    with patch.object(circle_wallet, "_client", return_value=MagicMock()), patch(
        "circle.web3.user_controlled_wallets.WalletsApi", return_value=fake_api
    ):
        result = circle_wallet.list_wallets("ut-token")

    assert result["ok"] is True
    assert result["wallets"][0]["walletId"] == "w-1"
    assert result["wallets"][0]["blockchain"] == "ARC-TESTNET"


def test_list_wallets_no_token():
    result = circle_wallet.list_wallets("")
    assert result["ok"] is False
    assert result["wallets"] == []
