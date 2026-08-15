"""Unit tests for the pure helper functions in main.py (no network)."""

from types import SimpleNamespace

import main


def raw_escrow(
    funded=False,
    work_submitted=False,
    approved=False,
    released=False,
    refunded=False,
    disputed=False,
    amount=1_500_000,
    client="0x1111111111111111111111111111111111111111",
    freelancer="0x2222222222222222222222222222222222222222",
):
    return (
        client,
        freelancer,
        amount,
        funded,
        work_submitted,
        approved,
        released,
        refunded,
        disputed,
        1_700_000_000,  # createdAt
        1_700_604_800,  # expiresAt (7 days later)
    )


class TestShort:
    def test_none(self):
        assert main.short(None) == "--"

    def test_short_hex(self):
        # any 0x-prefixed string >= 10 chars gets shortened
        assert main.short("0x1234567890abcdef") == "0x1234...cdef"

    def test_full_address(self):
        assert main.short("0x1234567890abcdef1234567890abcdef12345678") == "0x1234...5678"

    def test_not_hex(self):
        assert main.short("hello") == "hello"


class TestUsdcFmt:
    def test_whole_units(self):
        assert main.usdc_fmt(1_000_000) == "1.00 USDC"

    def test_decimal_units(self):
        assert main.usdc_fmt(1_500_000) == "1.50 USDC"

    def test_zero(self):
        assert main.usdc_fmt(0) == "0.00 USDC"

    def test_string_number(self):
        assert main.usdc_fmt("2500000") == "2.50 USDC"

    def test_invalid(self):
        assert main.usdc_fmt("garbage") == "--"

    def test_none(self):
        assert main.usdc_fmt(None) == "--"


class TestMapEscrow:
    def test_waiting_default(self):
        e = main.map_escrow(raw_escrow(), 1)
        assert e["id"] == "1"
        assert e["status"] == "waiting"
        assert e["client_short"] == "0x1111...1111"
        assert e["amount"] == "1.50 USDC"
        assert e["amount_wei"] == "1500000"

    def test_funded(self):
        e = main.map_escrow(raw_escrow(funded=True), 2)
        assert e["status"] == "funded"
        assert e["funded"] is True

    def test_submitted(self):
        e = main.map_escrow(raw_escrow(funded=True, work_submitted=True), 3)
        assert e["status"] == "submitted"

    def test_approved(self):
        e = main.map_escrow(raw_escrow(funded=True, work_submitted=True, approved=True), 4)
        assert e["status"] == "approved"

    def test_released(self):
        e = main.map_escrow(
            raw_escrow(funded=True, work_submitted=True, approved=True, released=True), 5
        )
        assert e["status"] == "released"

    def test_refunded(self):
        e = main.map_escrow(raw_escrow(refunded=True), 6)
        assert e["status"] == "refunded"

    def test_disputed_wins_over_released(self):
        e = main.map_escrow(
            raw_escrow(funded=True, work_submitted=True, approved=True, released=True, disputed=True), 7
        )
        assert e["status"] == "disputed"

    def test_handles_namedtuple_style_object(self):
        raw = SimpleNamespace(
            client="0x1111111111111111111111111111111111111111",
            freelancer="0x2222222222222222222222222222222222222222",
            amount=2_000_000,
            funded=True,
            workSubmitted=True,
            approved=False,
            released=False,
            refunded=False,
            disputed=False,
            createdAt=1_700_000_000,
            expiresAt=1_700_604_800,
        )
        e = main.map_escrow(raw, 8)
        assert e["status"] == "submitted"
        assert e["amount"] == "2.00 USDC"


class TestEventItem:
    def test_known_event(self):
        item = main.event_item(
            "DisputeRaised",
            {"escrowId": 3},
            block_number=100,
            tx_hash="0xabc",
        )
        assert item["label"] == "Dispute Raised"
        assert item["tone"] == "disputed"
        assert item["escrow_id"] == "3"
        assert item["block"] == 100
        assert item["tx_hash"] == "0xabc"

    def test_event_with_amount(self):
        item = main.event_item("FundsReleased", {"escrowId": 1, "amount": 5_000_000}, 10, "0x")
        assert item["amount"] == "5.00 USDC"

    def test_unknown_event_falls_back(self):
        item = main.event_item("MysteryEvent", {"id": 9}, 5, "0x")
        assert item["label"] == "MysteryEvent"
        assert item["tone"] == "neutral"
        assert item["escrow_id"] == "9"
