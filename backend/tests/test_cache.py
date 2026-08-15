"""Tests for the in-memory caches: TTL behavior and partial-read safety."""

from types import SimpleNamespace

import main


class _EscrowCountFn:
    def __init__(self, value):
        self._value = value

    def call(self):
        return self._value


class _EscrowFn:
    def __init__(self, raw):
        self._raw = raw

    def call(self):
        return self._raw


class FakeContract:
    def __init__(self, count, escrows):
        self._count = count
        self._escrows = escrows

    @property
    def functions(self):
        return self

    def escrowCount(self):
        return _EscrowCountFn(self._count)

    def escrows(self, idx):
        if idx not in self._escrows:
            raise Exception("missing")
        return _EscrowFn(self._escrows[idx])


def _raw(i):
    from tests.test_helpers import raw_escrow

    return raw_escrow(amount=i * 1_000_000, funded=True)


def _reset_escrows_cache(monkeypatch):
    monkeypatch.setattr(
        main, "_escrows_cache",
        {"timestamp": 0.0, "escrows": [], "total": 0, "complete": False},
    )


def test_load_all_escrows_caches_on_ttl(client, monkeypatch):
    escrows = {1: _raw(1), 2: _raw(2), 3: _raw(3)}
    monkeypatch.setattr(main, "contract", FakeContract(3, escrows))
    _reset_escrows_cache(monkeypatch)

    data = main.load_all_escrows()
    assert data["complete"] is True
    assert data["total"] == 3
    assert [e["id"] for e in data["escrows"]] == ["3", "2", "1"]
    assert data["escrows"][0]["amount"] == "3.00 USDC"

    # Second call within TTL must hit the cache, not re-fetch.
    calls = {"n": 0}
    original = main._fetch_escrow

    def counting_fetch(i):
        calls["n"] += 1
        return original(i)

    monkeypatch.setattr(main, "_fetch_escrow", counting_fetch)
    again = main.load_all_escrows()
    assert calls["n"] == 0  # served from cache
    assert again["escrows"] == data["escrows"]


def test_load_all_escrows_partial_read_not_cached(client, monkeypatch):
    """An RPC hiccup (missing escrow) must not poison the cache: return
    complete=False and let the next poll retry."""

    class FlakyContract(FakeContract):
        def escrows(self, idx):
            if idx == 2:
                raise Exception("RPC rate-limited")
            return _EscrowFn(self._escrows[idx])

    escrows = {1: _raw(1), 2: _raw(2), 3: _raw(3)}
    monkeypatch.setattr(main, "contract", FlakyContract(3, escrows))
    _reset_escrows_cache(monkeypatch)

    data = main.load_all_escrows()
    assert data["complete"] is False
    # Partial data must NOT be cached as if it were the full list.
    assert data["escrows"] == []

    # Next call retries instead of serving stale partial data.
    monkeypatch.setattr(main, "contract", FakeContract(3, escrows))
    data2 = main.load_all_escrows()
    assert data2["complete"] is True
    assert len(data2["escrows"]) == 3


def test_summary_cache_poisoning_guard(client, monkeypatch):
    """load_chain_summary must not cache a misleading '0 escrows' snapshot when
    the RPC read fails."""
    monkeypatch.setattr(main, "state", SimpleNamespace(
        healthy=False, latest_block=0, last_scanned_block=0, last_synced_at=0,
        error="", recent_events=[]
    ))

    class BrokenContract:
        @property
        def functions(self):
            return self

        def escrowCount(self):
            raise Exception("boom")

    monkeypatch.setattr(main, "contract", BrokenContract())
    monkeypatch.setattr(main, "_summary_cache", {"timestamp": 0.0, "data": None})

    summary = main.load_chain_summary(use_cache=False)
    assert summary["stats"]["total_escrows"] == 0
    assert main._summary_cache["data"] is None  # not cached
