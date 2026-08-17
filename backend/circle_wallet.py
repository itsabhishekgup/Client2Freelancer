"""Circle User-Controlled Wallets integration (backend orchestrator).

The Circle UCW flow needs two pieces:

1. This backend module talks to Circle's REST API with the *server-side*
   API key + entity secret (never exposed to the browser). It creates the
   login challenge, creates wallets, and creates contract-execution
   challenges for escrow actions.
2. The frontend Web SDK (@circle-fin/w3s-pw-web-sdk) receives the userToken
   + challengeId and completes the challenge on-device (email OTP, PIN, ...).

Every function here degrades gracefully when Circle is not configured:
the caller gets a friendly error dict instead of a crash, so the app keeps
working with the regular wallet flow (Reown) regardless.
"""

from __future__ import annotations

import os
import uuid
from typing import Any, Dict, Optional

# Arc Testnet is officially supported by Circle UCW (ARC-TESTNET: EOA/SCA/MSCA).
DEFAULT_BLOCKCHAINS = ["ARC-TESTNET"]

# Escrow contract ABI signatures used for Circle contract-execution challenges.
CREATE_ESCROW_SIG = "createEscrow(address,uint256)"
CREATE_ESCROW_WITH_DEADLINE_SIG = "createEscrowWithDeadline(address,uint256,uint256)"
DEPOSIT_SIG = "depositFunds(uint256)"
SUBMIT_WORK_SIG = "submitWork(uint256)"
APPROVE_WORK_SIG = "approveWork(uint256)"
RELEASE_SIG = "releaseFunds(uint256)"
CANCEL_SIG = "cancelEscrow(uint256)"
DISPUTE_SIG = "disputeEscrow(uint256)"


def circle_configured() -> bool:
    """True when the backend has Circle credentials configured in .env."""
    return bool(os.getenv("CIRCLE_API_KEY", "").strip())


def circle_app_id() -> str:
    return os.getenv("CIRCLE_APP_ID", "").strip()


def _client():
    from circle.web3 import user_controlled_wallets as uw

    utils_config = getattr(__import__("circle.web3.utils", fromlist=["x"]), "init_configurations_client")
    utils_config()
    conf = uw.Configuration(access_token=os.getenv("CIRCLE_API_KEY", "").strip())
    # Entity secret is a separate secret from the Circle console; when present it is
    # attached to the configuration so the SDK can encrypt challenge payloads.
    entity_secret = os.getenv("CIRCLE_ENTITY_SECRET", "").strip()
    if entity_secret:
        conf.entity_secret = entity_secret
    return uw.ApiClient(configuration=conf)


def _err(message: str) -> Dict[str, Any]:
    return {"ok": False, "error": message}


def config() -> Dict[str, Any]:
    return {
        "configured": circle_configured(),
        "app_id": circle_app_id(),
        "blockchains": DEFAULT_BLOCKCHAINS,
    }


def email_login(email: str) -> Dict[str, Any]:
    """Start email-OTP login. Returns userToken + challengeId for the web SDK."""
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return _err("Enter a valid email address.")
    if not circle_configured():
        return _err(
            "Circle Wallet is not configured yet. Add CIRCLE_API_KEY to "
            "backend/.env (see README)."
        )
    try:
        from circle.web3 import user_controlled_wallets as uw

        api = uw.SocialEmailAuthenticationApi(_client())
        resp = api.create_device_token_email_login(
            device_token_email_request={
                "email": email,
                "deviceId": str(uuid.uuid4()),
                "idempotencyKey": str(uuid.uuid4()),
            }
        )
        data = resp.data
        return {
            "ok": True,
            "userToken": getattr(data, "user_token", None),
            "encryptionKey": getattr(data, "encryption_key", None),
            "challengeId": getattr(data, "challenge_id", None),
        }
    except Exception as exc:  # noqa: BLE001 — surface to UI, never crash
        return _err(f"Circle email login failed: {exc}")


def pin_login(user_id: str) -> Dict[str, Any]:
    """PIN-based login (no SMTP needed).

    Creates the user if needed, then returns a userToken + encryptionKey the
    web SDK uses to run the PIN-setup / challenge UI on-device.
    """
    user_id = (user_id or "").strip()
    if not user_id:
        return _err("Enter a user ID (any unique string, e.g. your email).")
    if not circle_configured():
        return _err(
            "Circle Wallet is not configured yet. Add CIRCLE_API_KEY to "
            "backend/.env (see README)."
        )
    try:
        from circle.web3 import user_controlled_wallets as uw

        api = uw.PINAuthenticationApi(_client())
        # create_user returns 409 when the user already exists — that's fine,
        # we only need the userToken, which get_user_token returns either way.
        try:
            api.create_user(create_user_request={"userId": user_id})
        except Exception as exc:  # noqa: BLE001
            if "409" not in str(exc):
                raise
        token_resp = api.get_user_token(user_token_request={"userId": user_id})
        data = token_resp.data
        return {
            "ok": True,
            "userToken": getattr(data, "user_token", None),
            "encryptionKey": getattr(data, "encryption_key", None),
            "userId": user_id,
        }
    except Exception as exc:  # noqa: BLE001 — surface to UI, never crash
        return _err(f"Circle PIN login failed: {exc}")


def create_wallet(user_token: str) -> Dict[str, Any]:
    """Create a user-controlled wallet on Arc Testnet."""
    if not circle_configured():
        return _err("Circle Wallet is not configured yet.")
    if not user_token:
        return _err("Missing userToken — log in with email first.")
    try:
        from circle.web3 import user_controlled_wallets as uw

        api = uw.WalletsApi(_client())
        resp = api.create_user_wallet(
            x_user_token=user_token,
            create_end_user_wallet_request={
                "idempotencyKey": str(uuid.uuid4()),
                "blockchains": DEFAULT_BLOCKCHAINS,
            },
        )
        data = resp.data
        return {
            "ok": True,
            "walletId": getattr(data, "wallet_id", None),
            "challengeId": getattr(data, "challenge_id", None),
            "walletSetId": getattr(data, "wallet_set_id", None),
        }
    except Exception as exc:  # noqa: BLE001
        return _err(f"Circle wallet creation failed: {exc}")


def contract_execution(
    user_token: str,
    wallet_id: str,
    abi_signature: str,
    abi_params: list,
) -> Dict[str, Any]:
    """Create a contract-execution challenge for an escrow action."""
    if not circle_configured():
        return _err("Circle Wallet is not configured yet.")
    if not user_token or not wallet_id:
        return _err("Missing userToken or walletId — connect with Circle first.")
    try:
        from circle.web3 import user_controlled_wallets as uw

        api = uw.TransactionsApi(_client())
        resp = api.create_user_transaction_contract_execution_challenge(
            x_user_token=user_token,
            create_contract_execution_transaction_for_end_user_request={
                "idempotencyKey": str(uuid.uuid4()),
                "walletId": wallet_id,
                "contractAddress": os.getenv(
                    "CONTRACT_ADDRESS", "0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3"
                ),
                "abiFunctionSignature": abi_signature,
                "abiParameters": abi_params,
                "feeLevel": "MEDIUM",
            },
        )
        data = resp.data
        return {
            "ok": True,
            "challengeId": getattr(data, "challenge_id", None),
        }
    except Exception as exc:  # noqa: BLE001
        return _err(f"Circle contract execution challenge failed: {exc}")


def list_wallets(user_token: str) -> Dict[str, Any]:
    """List the user's wallets (to recover an existing wallet after re-login)."""
    if not circle_configured() or not user_token:
        return {"ok": False, "wallets": []}
    try:
        from circle.web3 import user_controlled_wallets as uw

        api = uw.WalletsApi(_client())
        resp = api.list_wallets(x_user_token=user_token)
        wallets = []
        raw = resp.data
        items = raw.get("wallets") if isinstance(raw, dict) else getattr(raw, "wallets", None) or []
        for w in items:
            if isinstance(w, dict):
                wallets.append(
                    {
                        "walletId": w.get("wallet_id"),
                        "address": w.get("address"),
                        "blockchain": w.get("blockchain"),
                    }
                )
            else:
                wallets.append(
                    {
                        "walletId": getattr(w, "wallet_id", None),
                        "address": getattr(w, "address", None),
                        "blockchain": getattr(w, "blockchain", None),
                    }
                )
        return {"ok": True, "wallets": wallets}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc), "wallets": []}


def escrow_action_signature(action: str) -> Optional[str]:
    return {
        "create": CREATE_ESCROW_SIG,
        "createDeadline": CREATE_ESCROW_WITH_DEADLINE_SIG,
        "deposit": DEPOSIT_SIG,
        "submit": SUBMIT_WORK_SIG,
        "approve": APPROVE_WORK_SIG,
        "release": RELEASE_SIG,
        "cancel": CANCEL_SIG,
        "dispute": DISPUTE_SIG,
    }.get(action)
