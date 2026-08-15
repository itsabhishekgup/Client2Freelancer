"""API endpoint tests. The contract is mocked so no real RPC traffic happens."""

from types import SimpleNamespace

import main


class FakeContract:
    """Minimal stand-in for the web3 contract object used by the backend."""

    def __init__(self, escrow_count=3, escrows=None):
        self._count = escrow_count
        self._escrows = escrows or {}

    class _CountFn:
        def __init__(self, value):
            self._value = value

        def call(self):
            return self._value

    class _EscrowFn:
        def __init__(self, raw):
            self._raw = raw

        def call(self):
            return self._raw

    @property
    def functions(self):
        return self

    def escrowCount(self):
        return FakeContract._CountFn(self._count)

    def escrows(self, idx):
        if idx not in self._escrows:
            raise Exception("escrow not found")
        return FakeContract._EscrowFn(self._escrows[idx])


def make_raw(idx, **overrides):
    from tests.test_helpers import raw_escrow

    return raw_escrow(**overrides)


def test_health_returns_fields(client, monkeypatch):
    monkeypatch.setattr(main, "state", SimpleNamespace(healthy=True, latest_block=100, error=""))
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["latest_block"] == 100
    assert body["contract_address"] == main.CONTRACT_ADDRESS
    assert body["rpc_url"] == main.ARC_RPC_URL


def test_escrow_detail_found(client, monkeypatch):
    fake = FakeContract(
        escrows={1: make_raw(1, funded=True, amount=2_000_000)},
    )
    monkeypatch.setattr(main, "contract", fake)
    r = client.get("/escrow/1")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "1"
    assert body["status"] == "funded"
    assert body["amount"] == "2.00 USDC"


def test_escrow_detail_not_found(client, monkeypatch):
    monkeypatch.setattr(main, "contract", FakeContract(escrows={}))
    r = client.get("/escrow/99")
    assert r.status_code == 200
    assert r.json() == {"error": "Escrow not found"}


def test_escrows_list_pagination_and_filters(client, monkeypatch):
    from tests.test_helpers import raw_escrow

    escrows = {
        1: raw_escrow(amount=1_000_000, funded=True,
                      freelancer="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
        2: raw_escrow(amount=2_000_000, funded=True, work_submitted=True,
                      freelancer="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
        3: raw_escrow(amount=3_000_000, refunded=True,
                      freelancer="0xcccccccccccccccccccccccccccccccccccccccc"),
    }
    monkeypatch.setattr(main, "contract", FakeContract(escrow_count=3, escrows=escrows))
    monkeypatch.setattr(main, "_escrows_cache", {"timestamp": 0.0, "escrows": [], "total": 0, "complete": False})

    r = client.get("/escrows")
    assert r.status_code == 200
    body = r.json()
    assert body["total_escrows"] == 3
    assert body["total"] == 3
    # newest first
    ids = [e["id"] for e in body["escrows"]]
    assert ids == ["3", "2", "1"]

    # status filter
    r = client.get("/escrows", params={"status": "refunded"})
    assert [e["id"] for e in r.json()["escrows"]] == ["3"]

    # status filter case-insensitive
    r = client.get("/escrows", params={"status": "REFUNDED"})
    assert [e["id"] for e in r.json()["escrows"]] == ["3"]

    # search by client address
    r = client.get("/escrows", params={"search": "1111"})
    assert len(r.json()["escrows"]) == 3

    # search by id
    r = client.get("/escrows", params={"search": "2"})
    ids = [e["id"] for e in r.json()["escrows"]]
    assert "2" in ids and "1" not in ids

    # pagination: limit 2
    r = client.get("/escrows", params={"limit": 2})
    body = r.json()
    assert len(body["escrows"]) == 2
    assert body["total"] == 3

    # pagination: offset
    r = client.get("/escrows", params={"offset": 2})
    assert [e["id"] for e in r.json()["escrows"]] == ["1"]

    # limit+offset combined
    r = client.get("/escrows", params={"limit": 1, "offset": 1})
    assert [e["id"] for e in r.json()["escrows"]] == ["2"]


def test_escrows_list_invalid_params(client):
    r = client.get("/escrows", params={"limit": 0})
    assert r.status_code == 422
    r = client.get("/escrows", params={"limit": 501})
    assert r.status_code == 422
    r = client.get("/escrows", params={"offset": -1})
    assert r.status_code == 422


def test_live_cold_start_empty(client, monkeypatch):
    """With no cache and no wallet, /live returns an empty summary instantly."""
    monkeypatch.setattr(main, "_summary_cache", {"timestamp": 0.0, "data": None})
    monkeypatch.setattr(main, "state", SimpleNamespace(
        healthy=False, latest_block=0, last_synced_at=0, error="", recent_events=[]
    ))
    monkeypatch.setattr(main, "usdc", SimpleNamespace(functions=SimpleNamespace(
        balanceOf=lambda a: SimpleNamespace(call=lambda: 0),
        allowance=lambda a, s: SimpleNamespace(call=lambda: 0),
    )))
    r = client.get("/live")
    assert r.status_code == 200
    body = r.json()
    assert body["stats"]["total_escrows"] == 0
    assert body["wallet"]["connected"] is False


def test_live_with_wallet(client, monkeypatch):
    monkeypatch.setattr(main, "_summary_cache", {"timestamp": 0.0, "data": None})
    monkeypatch.setattr(main, "state", SimpleNamespace(
        healthy=True, latest_block=100, last_synced_at=0, error="", recent_events=[]
    ))
    monkeypatch.setattr(main, "usdc", SimpleNamespace(functions=SimpleNamespace(
        balanceOf=lambda a: SimpleNamespace(call=lambda: 10_000_000),
        allowance=lambda a, s: SimpleNamespace(call=lambda: 5_000_000),
    )))
    r = client.get("/live", params={"address": "0x1111111111111111111111111111111111111111"})
    assert r.status_code == 200
    body = r.json()
    assert body["wallet"]["connected"] is True
    assert body["wallet"]["usdc_balance"] == "10.00 USDC"
    assert body["wallet"]["allowance"] == "5.00 USDC"


def test_wallet_summary_disconnected(client):
    w = main.load_wallet_summary("")
    assert w["connected"] is False
    assert w["usdc_balance"] == "--"
