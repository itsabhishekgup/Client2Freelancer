"""Tests for the rule-based assistant (no network / no API key needed)."""
import asyncio

import pytest

import assistant


CONTEXT = {
    "chain_name": "Arc Testnet",
    "chain_id": 5042002,
    "rpc_url": "https://rpc.testnet.arc.network",
    "contract_address": "0xabc",
}


@pytest.mark.parametrize(
    "question,expected_intent",
    [
        ("escrow kaise create kare?", "create_escrow"),
        ("how do I create an escrow", "create_escrow"),
        ("how do I deposit funds", "fund_deposit"),
        ("dispute kaise kare?", "dispute"),
        ("raise a dispute", "dispute"),
        ("paise wapas kaise milega", "cancel_refund"),
        ("how do I cancel the escrow", "cancel_refund"),
        ("contract address kya hai", "contract_info"),
        ("what network is this on", "contract_info"),
        ("wallet kaise connect kare", "wallet"),
        ("how do I connect my wallet", "wallet"),
        ("expiry timelock kya hai", "expiry"),
        ("status ka matlab kya hai", "status"),
        ("what does the status mean", "status"),
        ("hello hi namaste", "greeting"),
        ("thanks a lot", "thanks"),
        ("what is escrow", "what_is_escrow"),
        ("escrow kya hota hai", "what_is_escrow"),
        ("mainnet pe kab aayega", "production"),
        ("minimum amount kya hai", "min_amount"),
        ("why my funds not released", "funds_not_released"),
        ("create a python function that formats a table", None),
        ("why is my escrow not releasing funds even after work was submitted", "funds_not_released"),
        ("my escrow is not releasing funds", "funds_not_released"),
        ("funds stuck after dispute", "funds_not_released"),
        ("I sent USDC to the wrong address", "wrong_address"),
        ("transaction failed", "tx_failed"),
        ("wrong network error", "wrong_network"),
        ("usdc not approved", "allowance"),
        ("escrow not found", "escrow_not_found"),
        ("who is the arbitrator", "who_arbitrator"),
        ("can i cancel after funding", "cancel_after_funded"),
        ("escrow limit kya hai", "escrow_limit"),
        ("how does rescue work", "rescue_process"),
        ("refund kab aayega", "refund_timing"),
        ("how do I contact support", "contact_support"),
        ("transactions not showing", "data_refresh"),
        ("why arc", "why_arc"),
        ("what is arc network", "why_arc"),
        ("arc kya hai", "why_arc"),
    ],
)
def test_match_intent(question, expected_intent):
    entry = assistant.match_intent(question)
    if expected_intent is None:
        assert entry is None
        return
    assert entry is not None
    assert entry["intent"] == expected_intent


@pytest.mark.parametrize(
    "question,expected_lang",
    [
        ("how do I create an escrow", "en"),
        ("what is the contract address", "en"),
        ("escrow kaise banaun", "hi"),
        ("paise wapas kahan jayenge", "hi"),
        ("मुझे escrow बनाना है", "hi"),
        ("thanks", "en"),
        ("how long does release take", "en"),
    ],
)
def test_detect_language(question, expected_lang):
    assert assistant.detect_language(question) == expected_lang


def test_english_question_gets_english_answer():
    answer = assistant.rule_based_answer("How do I create an escrow?", CONTEXT)
    assert answer is not None
    # English answer should NOT contain Hinglish words
    assert "kaise" not in answer.lower()
    assert "Create Escrow" in answer


def test_hindi_question_gets_hindi_answer():
    answer = assistant.rule_based_answer("escrow kaise create kare?", CONTEXT)
    assert answer is not None
    assert "karne" in answer.lower()  # Hinglish marker present
    assert "kaise" not in answer.lower()  # and not the English variant
    assert "Create Escrow" in answer


def test_match_intent_unknown_returns_none():
    assert assistant.match_intent("quantum chromodynamics of escrow tokens") is None


def test_match_intent_short_keywords_use_word_boundaries():
    # "hi" must not match inside "this/which", "hey" inside "they", "yo" inside "you".
    assert assistant.match_intent("which option is better") is None
    assert assistant.match_intent("they took my money") is None
    assert assistant.match_intent("you can do it") is None
    # Standalone greeting words still match.
    assert assistant.match_intent("hi")["intent"] == "greeting"
    assert assistant.match_intent("hey there")["intent"] == "greeting"


def test_claim_after_expiry_kb_is_freelancer_only():
    answer = assistant.rule_based_answer("who can claim after expiry", CONTEXT)
    assert answer is not None
    lower = answer.lower()
    # The answer must describe the freelancer claim path, not a client claim.
    assert "freelancer" in lower
    assert "cancel" in lower  # the client path after expiry is cancel


def test_escrow_cap_kb_describes_open_escrows():
    answer = assistant.rule_based_answer("escrow cap kya hai", CONTEXT)
    assert answer is not None
    lower = answer.lower()
    assert "open" in lower or "simultaneous" in lower


def test_rule_based_answer_formats_context():
    answer = assistant.rule_based_answer("contract address kya hai", CONTEXT)
    assert answer is not None
    assert CONTEXT["contract_address"] in answer
    assert "Arc Testnet" in answer


def test_rule_based_answer_unknown():
    assert assistant.rule_based_answer("completely random gibberish", CONTEXT) is None


def test_answer_unknown_without_key_uses_fallback(monkeypatch):
    monkeypatch.setattr(assistant, "GEMINI_API_KEY", "")
    result = asyncio.run(assistant.answer("completely random gibberish", [], CONTEXT))
    assert result["source"] == "fallback"
    assert result["answer"]


def test_answer_rules_first():
    result = asyncio.run(assistant.answer("escrow kaise create kare?", [], CONTEXT))
    assert result["source"] == "rules"
    assert "Create Escrow" in result["answer"]


def test_answer_empty_question():
    result = asyncio.run(assistant.answer("   ", [], CONTEXT))
    assert result["source"] == "rules"


def test_personalized_diagnosis_has_no_boilerplate_disclaimer():
    """The repeated 'on-chain facts / signed transaction' trailer must be gone."""
    escrow = {
        "id": "7",
        "amount": "5.00 USDC",
        "funded": True,
        "workSubmitted": False,
        "approved": False,
        "released": False,
        "refunded": False,
        "disputed": False,
        "createdAt": 1_700_000_000,
        "expiresAt": 1_700_604_800,
    }
    context = {
        "escrow_data": escrow,
        "wallet_live": {"role": "client", "usdc_balance": "10.00 USDC", "allowance": "5.00 USDC"},
    }
    out = assistant.personalized_diagnosis("what should I do with escrow 7", context)
    assert out is not None
    lower = out.lower()
    assert "on-chain facts" not in lower
    assert "signed transaction" not in lower
    assert "wallet" not in lower or "your usdc balance" in lower
    # Still role-aware and actionable.
    assert "client" in lower
    assert "submit work" in lower


def test_personalized_diagnosis_is_role_and_stage_aware(monkeypatch):
    """Expired + funded -> client gets the cancel-refund path, not a generic FAQ."""
    escrow = {
        "id": "9",
        "amount": "3.00 USDC",
        "funded": True,
        "workSubmitted": False,
        "approved": False,
        "released": False,
        "refunded": False,
        "disputed": False,
        "createdAt": 1_700_000_000,
        "expiresAt": 1_000_000_000,  # long expired
    }
    context = {
        "escrow_data": escrow,
        "wallet_live": {"role": "client", "usdc_balance": None, "allowance": None},
    }
    out = assistant.personalized_diagnosis("escrow 9 refund", context)
    assert out is not None
    lower = out.lower()
    assert "cancel escrow" in lower
    assert "full refund" in lower


def test_personalized_diagnosis_returns_none_without_escrow():
    assert assistant.personalized_diagnosis("hi", {}) is None
