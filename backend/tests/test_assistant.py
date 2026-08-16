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
    ],
)
def test_match_intent(question, expected_intent):
    entry = assistant.match_intent(question)
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
