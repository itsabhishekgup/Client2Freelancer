from __future__ import annotations

import asyncio
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from web3 import Web3
from dotenv import load_dotenv

# Load backend/.env (RPC, contract, GEMINI_API_KEY, ...) BEFORE importing
# assistant, which reads GEMINI_API_KEY at module import time.
load_dotenv()

from assistant import answer as assistant_answer

ARC_RPC_URL = os.getenv("ARC_RPC_URL", "https://rpc.testnet.arc.network")
CONTRACT_ADDRESS = Web3.to_checksum_address(
    os.getenv("CONTRACT_ADDRESS", "0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3")
)
USDC_ADDRESS = Web3.to_checksum_address(
    os.getenv("USDC_ADDRESS", "0x3600000000000000000000000000000000000000")
)
CHAIN_NAME = os.getenv("CHAIN_NAME", "Arc Testnet")
CHAIN_ID = int(os.getenv("CHAIN_ID", "5042002"))
POLL_SECONDS = max(3, int(os.getenv("POLL_SECONDS", "8")))
RECENT_BLOCKS = max(1, int(os.getenv("RECENT_BLOCKS", "2000")))
# How far back to look for events on startup (feed backfill). Arc testnet is
# very fast (~1000 blocks/min), so the default covers a meaningful slice. The
# poller grinds through this window in MAX_SCAN_BLOCKS chunks so a slow or
# rate-limited RPC doesn't get blasted with one huge get_logs range.
BACKFILL_BLOCKS = max(RECENT_BLOCKS, int(os.getenv("BACKFILL_BLOCKS", "60000")))
# Max blocks scanned per poll cycle; keeps each cycle cheap and RPC-friendly.
MAX_SCAN_BLOCKS = max(RECENT_BLOCKS, int(os.getenv("MAX_SCAN_BLOCKS", "2000")))
SAMPLE_ESCROWS = max(4, int(os.getenv("SAMPLE_ESCROWS", "12")))
# If the total escrow count is at or below this, load every escrow so stats are exact.
MAX_ESCROWS = max(SAMPLE_ESCROWS, int(os.getenv("MAX_ESCROWS", "100")))
# Comma-separated list of allowed browser origins (frontend dev server by default).
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://[::1]:5173"
    ).split(",")
    if origin.strip()
]

ABI = [
    {
        "type": "function",
        "name": "escrowCount",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "owner",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "arbitrator",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "lockedBalance",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "maxEscrowsPerClient",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "event",
        "name": "TokensRescued",
        "anonymous": False,
        "inputs": [
            {"name": "token", "type": "address", "indexed": True},
            {"name": "recipient", "type": "address", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
    {
        "type": "function",
        "name": "escrows",
        "inputs": [{"name": "", "type": "uint256"}],
        "outputs": [
            {"name": "client", "type": "address"},
            {"name": "freelancer", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "funded", "type": "bool"},
            {"name": "workSubmitted", "type": "bool"},
            {"name": "approved", "type": "bool"},
            {"name": "released", "type": "bool"},
            {"name": "refunded", "type": "bool"},
            {"name": "disputed", "type": "bool"},
            {"name": "createdAt", "type": "uint256"},
            {"name": "expiresAt", "type": "uint256"},
        ],
        "stateMutability": "view",
    },
    {
        "type": "event",
        "name": "EscrowCreated",
        "anonymous": False,
        "inputs": [
            {"name": "escrowId", "type": "uint256", "indexed": True},
            {"name": "client", "type": "address", "indexed": True},
            {"name": "freelancer", "type": "address", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
    {
        "type": "event",
        "name": "FundsDeposited",
        "anonymous": False,
        "inputs": [
            {"name": "escrowId", "type": "uint256", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
    {
        "type": "event",
        "name": "WorkSubmitted",
        "anonymous": False,
        "inputs": [{"name": "escrowId", "type": "uint256", "indexed": True}],
    },
    {
        "type": "event",
        "name": "WorkApproved",
        "anonymous": False,
        "inputs": [{"name": "escrowId", "type": "uint256", "indexed": True}],
    },
    {
        "type": "event",
        "name": "FundsReleased",
        "anonymous": False,
        "inputs": [
            {"name": "escrowId", "type": "uint256", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
    {
        "type": "event",
        "name": "EscrowCancelled",
        "anonymous": False,
        "inputs": [
            {"name": "escrowId", "type": "uint256", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
    {
        "type": "event",
        "name": "DisputeRaised",
        "anonymous": False,
        "inputs": [{"name": "escrowId", "type": "uint256", "indexed": True}],
    },
    {
        "type": "event",
        "name": "DisputeResolved",
        "anonymous": False,
        "inputs": [
            {"name": "escrowId", "type": "uint256", "indexed": True},
            {"name": "favorFreelancer", "type": "bool", "indexed": False},
            {"name": "amount", "type": "uint256", "indexed": False},
        ],
    },
]

USDC_ABI = [
    {
        "type": "function",
        "name": "balanceOf",
        "inputs": [{"name": "account", "type": "address"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "allowance",
        "inputs": [
            {"name": "owner", "type": "address"},
            {"name": "spender", "type": "address"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
]

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize chain state on startup and stop the poller on shutdown."""
    try:
        state.latest_block = int(w3.eth.block_number)
        state.last_scanned_block = max(1, state.latest_block - BACKFILL_BLOCKS)
        state.healthy = True
    except Exception as exc:
        state.healthy = False
        state.error = str(exc)

    task = asyncio.create_task(poll_chain())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="ArcBridge Live API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

w3 = Web3(Web3.HTTPProvider(ARC_RPC_URL, request_kwargs={"timeout": 12}))
contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=ABI)
usdc = w3.eth.contract(address=USDC_ADDRESS, abi=USDC_ABI)


@dataclass
class ChainState:
    healthy: bool = False
    error: str = ""
    latest_block: int = 0
    last_scanned_block: int = 0
    last_synced_at: int = 0
    recent_events: List[Dict[str, Any]] = field(default_factory=list)


state = ChainState()


EVENT_META = {
    "EscrowCreated": {"label": "Escrow Created", "tone": "completed", "icon": "✨"},
    "FundsDeposited": {"label": "Funds Deposited", "tone": "funded", "icon": "💰"},
    "WorkSubmitted": {"label": "Work Submitted", "tone": "submitted", "icon": "📝"},
    "WorkApproved": {"label": "Work Approved", "tone": "approved", "icon": "✅"},
    "FundsReleased": {"label": "Funds Released", "tone": "completed", "icon": "🚀"},
    "EscrowCancelled": {"label": "Escrow Cancelled", "tone": "cancelled", "icon": "↩️"},
    "DisputeRaised": {"label": "Dispute Raised", "tone": "disputed", "icon": "⚠️"},
    "DisputeResolved": {"label": "Dispute Resolved", "tone": "completed", "icon": "⚖️"},
    "TokensRescued": {"label": "Recovery Executed", "tone": "completed", "icon": "🛟"},
}


def now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def short(address: Optional[str]) -> str:
    if not address:
        return "--"
    address = str(address)
    if not address.startswith("0x") or len(address) < 10:
        return address
    return f"{address[:6]}...{address[-4:]}"


def usdc_fmt(value: Any) -> str:
    try:
        return f"{int(value) / 1_000_000:.2f} USDC"
    except Exception:
        try:
            return f"{float(value):.2f} USDC"
        except Exception:
            return "--"


def map_escrow(raw: Any, escrow_id: int) -> Dict[str, Any]:
    try:
        client = raw[0]
        freelancer = raw[1]
        amount = raw[2]
        funded = bool(raw[3])
        work_submitted = bool(raw[4])
        approved = bool(raw[5])
        released = bool(raw[6])
        refunded = bool(raw[7])
        disputed = bool(raw[8])
        created_at = int(raw[9])
        expires_at = int(raw[10])
    except Exception:
        client = getattr(raw, "client", None)
        freelancer = getattr(raw, "freelancer", None)
        amount = getattr(raw, "amount", 0)
        funded = bool(getattr(raw, "funded", False))
        work_submitted = bool(getattr(raw, "workSubmitted", False))
        approved = bool(getattr(raw, "approved", False))
        released = bool(getattr(raw, "released", False))
        refunded = bool(getattr(raw, "refunded", False))
        disputed = bool(getattr(raw, "disputed", False))
        created_at = int(getattr(raw, "createdAt", 0) or 0)
        expires_at = int(getattr(raw, "expiresAt", 0) or 0)

    if disputed:
        status = "disputed"
    elif refunded:
        status = "refunded"
    elif released:
        status = "released"
    elif approved:
        status = "approved"
    elif work_submitted:
        status = "submitted"
    elif funded:
        status = "funded"
    else:
        status = "waiting"

    return {
        "id": str(escrow_id),
        "client": client,
        "client_short": short(client),
        "freelancer": freelancer,
        "freelancer_short": short(freelancer),
        "amount_wei": str(int(amount)),
        "amount": usdc_fmt(amount),
        "funded": funded,
        "workSubmitted": work_submitted,
        "approved": approved,
        "released": released,
        "refunded": refunded,
        "disputed": disputed,
        "createdAt": created_at,
        "expiresAt": expires_at,
        "status": status,
    }


def event_item(name: str, args: Dict[str, Any], block_number: int, tx_hash: str) -> Dict[str, Any]:
    meta = EVENT_META.get(name, {"label": name, "tone": "neutral", "icon": "•"})
    escrow_id = args.get("escrowId") or args.get("id") or args.get("escrow_id")
    amount = args.get("amount")
    return {
        "event": name,
        "label": meta["label"],
        "tone": meta["tone"],
        "icon": meta["icon"],
        "escrow_id": str(escrow_id) if escrow_id is not None else None,
        "amount": usdc_fmt(amount) if amount is not None else None,
        "block": block_number,
        "tx_hash": tx_hash,
        "time_ago": 0,
        "detail": f"{meta['label']} on-chain.",
    }


def safe_call(fn, default=None):
    try:
        return fn()
    except Exception:
        return default


# In-memory cache so /live does not re-query every escrow on each request.
_summary_cache: Dict[str, Any] = {"timestamp": 0.0, "data": None}
# In-memory cache for /escrows: the full escrow list, refreshed on a TTL.
_escrows_cache: Dict[str, Any] = {
    "timestamp": 0.0,
    "escrows": [],
    "total": 0,
    "complete": False,
}
ESCROWS_CACHE_TTL = float(os.getenv("ESCROWS_CACHE_TTL", "15"))


def _fetch_escrow(escrow_id: int) -> Optional[Dict[str, Any]]:
    raw = safe_call(lambda i=escrow_id: contract.functions.escrows(i).call())
    if raw is None:
        return None
    # Non-existent escrows come back from the contract as a zero-address
    # placeholder — treat them as not found so callers (chat, /escrow/{id})
    # don't present a fake "Waiting" escrow.
    try:
        client = raw[0] if isinstance(raw, (list, tuple)) else getattr(raw, "client", None)
        if not client or str(client) == "0x" + "0" * 40:
            return None
    except Exception:
        return None
    try:
        return map_escrow(raw, escrow_id)
    except Exception:
        return None


def load_all_escrows() -> Dict[str, Any]:
    """Return every escrow (newest first) read from escrowCount, cached on a
    short TTL so /escrows stays fast and RPC-friendly at scale."""
    now = time.monotonic()
    if _escrows_cache["escrows"] and now - _escrows_cache["timestamp"] < ESCROWS_CACHE_TTL:
        return _escrows_cache

    total_raw = safe_call(lambda: int(contract.functions.escrowCount().call()))
    total = total_raw or 0
    # Keep the endpoint bounded: load up to MAX_ESCROWS and report total.
    limit = min(total, MAX_ESCROWS)
    escrows: List[Dict[str, Any]] = []
    fetch_failures = 0
    if limit > 0:
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(_fetch_escrow, range(1, limit + 1)))
        for result in results:
            if result is None:
                fetch_failures += 1
            else:
                escrows.append(result)

    # Newest escrow first.
    escrows.sort(key=lambda e: int(e["id"]), reverse=True)

    complete = fetch_failures == 0
    # Only cache complete reads so a rate-limited RPC can't poison the list
    # with a misleading partial snapshot.
    if complete:
        _escrows_cache["timestamp"] = now
        _escrows_cache["escrows"] = escrows
        _escrows_cache["total"] = total
        _escrows_cache["complete"] = True
    return _escrows_cache


def _empty_summary() -> Dict[str, Any]:
    return {
        "chain": {
            "name": CHAIN_NAME,
            "id": CHAIN_ID,
            "latest_block": state.latest_block,
            "healthy": state.healthy,
            "error": state.error,
            "synced_at": state.last_synced_at,
        },
        "recent_escrows": [],
        "selected_escrow": None,
        "stats": {"total_escrows": 0, "funded": 0, "submitted": 0, "approved": 0, "released": 0},
    }


def load_chain_summary(use_cache: bool = True) -> Dict[str, Any]:
    # The background poller rebuilds the cache, so any cached value is served
    # without blocking a request on slow RPC reads.
    if use_cache and _summary_cache["data"] is not None:
        return _summary_cache["data"]

    latest_block = safe_call(lambda: int(w3.eth.block_number), state.latest_block)
    state.latest_block = latest_block or state.latest_block
    state.last_synced_at = now_ts()

    total_raw = safe_call(lambda: int(contract.functions.escrowCount().call()))
    if total_raw is None:
        # RPC hiccup: don't cache a misleading "0 escrows" snapshot; the next
        # poll cycle will retry the build.
        return _empty_summary()
    total = total_raw or 0

    # Load everything up to MAX_ESCROWS so stats are exact at reasonable scale;
    # beyond that, fall back to a sample so the endpoint stays fast.
    limit = total if total <= MAX_ESCROWS else SAMPLE_ESCROWS
    escrows: List[Dict[str, Any]] = []
    fetch_failures = 0
    if limit > 0:
        # Fetch escrows in parallel: the public testnet RPC is slow and
        # rate-limited, and a sequential loop of dozens of calls is very laggy.
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(_fetch_escrow, range(1, limit + 1)))
        for result in results:
            if result is None:
                fetch_failures += 1
            else:
                escrows.append(result)

    selected = None
    if escrows:
        selected = escrows[-1]

    stats = {
        "total_escrows": total,
        "funded": sum(1 for e in escrows if e["funded"]),
        "submitted": sum(1 for e in escrows if e["workSubmitted"]),
        "approved": sum(1 for e in escrows if e["approved"]),
        "released": sum(1 for e in escrows if e["released"]),
    }

    summary = {
        "chain": {
            "name": CHAIN_NAME,
            "id": CHAIN_ID,
            "latest_block": latest_block,
            "healthy": state.healthy,
            "error": state.error,
            "synced_at": state.last_synced_at,
        },
        "recent_escrows": list(reversed(escrows[-6:])),
        "selected_escrow": selected,
        "stats": stats,
    }

    # Only cache fully successful builds so a rate-limited RPC can't poison the
    # cache with a misleading "0 escrows" snapshot.
    if fetch_failures == 0:
        _summary_cache["timestamp"] = time.monotonic()
        _summary_cache["data"] = summary
    return summary


def load_wallet_summary(address: str) -> Dict[str, Any]:
    if not address:
        return {
            "connected": False,
            "address": "--",
            "short_address": "--",
            "network": CHAIN_NAME,
            "usdc_balance": "--",
            "allowance": "--",
        }

    checksum = Web3.to_checksum_address(address)
    balance = safe_call(lambda: usdc.functions.balanceOf(checksum).call(), 0)
    allowance = safe_call(lambda: usdc.functions.allowance(checksum, CONTRACT_ADDRESS).call(), 0)

    return {
        "connected": True,
        "address": checksum,
        "short_address": short(checksum),
        "network": CHAIN_NAME,
        "usdc_balance": usdc_fmt(balance),
        "allowance": usdc_fmt(allowance),
    }


def _get_logs_with_retry(event_class, from_block: int, to_block: int, attempts: int = 3) -> List[Any]:
    """get_logs with a short backoff so transient RPC rate-limits (HTTP 429)
    don't silently drop events from the feed."""
    last_error: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            return event_class().get_logs(from_block=from_block, to_block=to_block)
        except Exception as exc:  # noqa: BLE001 - surface any RPC failure
            last_error = exc
            time.sleep(1.0 + attempt)
    raise last_error  # type: ignore[misc]


def scan_new_events(from_block: int, to_block: int) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    if from_block > to_block:
        return events

    event_names = list(EVENT_META.keys())
    block_time_cache: Dict[int, int] = {}
    for event_name in event_names:
        try:
            event_class = getattr(contract.events, event_name)
            logs = _get_logs_with_retry(event_class, from_block, to_block)
        except Exception as exc:
            # Log once so feed gaps are diagnosable instead of silent.
            print(f"[scan_new_events] {event_name} {from_block}-{to_block} failed: {exc}", flush=True)
            logs = []

        for log in logs:
            args = dict(log["args"]) if "args" in log else {}
            tx_hash = log.get("transactionHash")
            tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            block_number = int(log.get("blockNumber", 0))
            item = event_item(event_name, args, block_number, tx_hash)
            # Use the real block timestamp (fetched once per block) instead of
            # treating the block *number* as a Unix timestamp.
            timestamp = block_time_cache.get(block_number)
            if timestamp is None:
                timestamp = safe_call(lambda b=block_number: int(w3.eth.get_block(b)["timestamp"]), 0)
                block_time_cache[block_number] = timestamp
            item["time_ago"] = max(0, now_ts() - timestamp)
            events.append(item)

    events.sort(key=lambda item: (item["block"], item.get("escrow_id") or ""), reverse=True)
    return events


async def poll_chain() -> None:
    """Background poller. All blocking web3 work runs in worker threads via
    asyncio.to_thread so the event loop stays free and HTTP requests (which
    run in FastAPI's thread pool) are never stalled by a slow RPC scan."""
    while True:
        try:
            latest = await asyncio.to_thread(lambda: int(w3.eth.block_number))
            start = state.last_scanned_block + 1 if state.last_scanned_block else max(1, latest - RECENT_BLOCKS)
            # Scan at most MAX_SCAN_BLOCKS per cycle so startup backfill (and any
            # sustained catch-up) stays incremental instead of one huge range.
            end = min(latest, start + MAX_SCAN_BLOCKS - 1)
            if end >= start:
                new_events = await asyncio.to_thread(scan_new_events, start, end)
                if new_events:
                    state.recent_events = (new_events + state.recent_events)[:200]
                state.last_scanned_block = end
            state.latest_block = latest
            state.healthy = True
            state.error = ""
            state.last_synced_at = now_ts()
            # Rebuild the cached summary in a worker thread (only cached when
            # the build completes without RPC failures).
            await asyncio.to_thread(lambda: load_chain_summary(use_cache=False))
        except Exception as exc:
            state.healthy = False
            state.error = str(exc)
        await asyncio.sleep(POLL_SECONDS)


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": state.healthy,
        "latest_block": state.latest_block,
        "error": state.error,
        "rpc_url": ARC_RPC_URL,
        "contract_address": CONTRACT_ADDRESS,
    }


@app.get("/live")
def live(address: str = Query(default=""), escrow_id: str = Query(default="")) -> Dict[str, Any]:
    # Cold start: answer instantly and let the background poller fill the data
    # within a poll cycle instead of blocking this request for tens of seconds.
    if _summary_cache["data"] is None:
        return {
            **_empty_summary(),
            "wallet": load_wallet_summary(address.strip()),
            "events": state.recent_events[:12],
            "event_total": len(state.recent_events),
        }

    chain = load_chain_summary()
    wallet = load_wallet_summary(address.strip())

    selected = chain["selected_escrow"]
    if escrow_id.strip().isdigit():
        escrow_number = int(escrow_id.strip())
        raw = safe_call(lambda: contract.functions.escrows(escrow_number).call())
        if raw is not None:
            try:
                selected = map_escrow(raw, escrow_number)
            except Exception:
                pass

    # Serve a per-escrow event timeline when escrow_id is given, otherwise the
    # 12 most recent events (the activity feed).
    if escrow_id.strip().isdigit():
        events = [
            ev for ev in state.recent_events if str(ev.get("escrow_id")) == escrow_id.strip()
        ]
    else:
        events = state.recent_events[:12]

    return {
        **chain,
        "wallet": wallet,
        "selected_escrow": selected,
        "events": events,
    }


@app.get("/escrow/{escrow_id}")
def escrow_detail(escrow_id: int) -> Dict[str, Any]:
    raw = safe_call(lambda: contract.functions.escrows(escrow_id).call())
    if raw is None:
        return {"error": "Escrow not found"}
    return map_escrow(raw, escrow_id)


@app.get("/escrows")
def escrows_list(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: str = Query(default=""),
    search: str = Query(default=""),
) -> Dict[str, Any]:
    data = load_all_escrows()
    escrows = data["escrows"]

    status_filter = status.strip().lower()
    if status_filter:
        escrows = [e for e in escrows if e["status"] == status_filter]

    query = search.strip().lower()
    if query:
        escrows = [
            e
            for e in escrows
            if query in e["id"]
            or query in str(e.get("client") or "").lower()
            or query in str(e.get("freelancer") or "").lower()
        ]

    total = len(escrows)
    page = escrows[offset : offset + limit]
    return {
        "escrows": page,
        "total": total,
        "total_escrows": data["total"],
        "complete": data["complete"],
        "cached": bool(data["escrows"]),
        "limit": limit,
        "offset": offset,
        "synced_at": state.last_synced_at,
    }


# In-memory cache for /safety: contract safety facts, refreshed on a TTL.
_safety_cache: Dict[str, Any] = {"timestamp": 0.0, "data": None}
SAFETY_CACHE_TTL = float(os.getenv("SAFETY_CACHE_TTL", "10"))


def load_safety_summary(use_cache: bool = True) -> Dict[str, Any]:
    """Real on-chain safety facts for the Safety Center. All reads are cheap
    eth_call view reads (no get_logs), cached on a short TTL. Values that
    cannot be verified are reported as None so the UI can show 'Not verified'
    instead of inventing results."""
    if use_cache and _safety_cache["data"] is not None:
        return _safety_cache["data"]

    owner = safe_call(lambda: contract.functions.owner().call(), None)
    arbitrator = safe_call(lambda: contract.functions.arbitrator().call(), None)
    locked_raw = safe_call(lambda: int(contract.functions.lockedBalance().call()), None)
    escrow_count_raw = safe_call(lambda: int(contract.functions.escrowCount().call()), None)
    max_per_client = safe_call(lambda: int(contract.functions.maxEscrowsPerClient().call()), None)
    contract_usdc_raw = safe_call(lambda: int(usdc.functions.balanceOf(CONTRACT_ADDRESS).call()), None)

    # Active escrows = funded and not yet released/refunded. Reuse the cached
    # escrow list (same bounded approach as /escrows) so we never hammer the RPC.
    escrows_data = load_all_escrows()
    active_escrows = sum(
        1
        for e in escrows_data["escrows"]
        if e.get("funded") and not e.get("released") and not e.get("refunded")
    )

    locked_ok = locked_raw is not None
    balance_ok = contract_usdc_raw is not None
    owner_ok = isinstance(owner, str) and owner != "0x" + "0" * 40

    recoverable_wei = 0
    if locked_ok and balance_ok:
        recoverable_wei = max(0, contract_usdc_raw - locked_raw)

    checks = {
        # A real, non-zero owner address is set on the contract.
        "owner_verified": bool(owner_ok),
        # The contract enforces escrow isolation: only the USDC balance ABOVE
        # lockedBalance can ever be rescued (enforced in rescueTokens).
        "escrow_isolation": bool(locked_ok),
        # The contract answered its view reads — it is reachable and readable.
        "contract_readable": bool(escrow_count_raw is not None and owner_ok),
        "chain_healthy": bool(state.healthy),
    }

    summary = {
        "chain": {
            "name": CHAIN_NAME,
            "id": CHAIN_ID,
            "latest_block": state.latest_block,
            "healthy": state.healthy,
            "synced_at": state.last_synced_at,
        },
        "contract": {
            "address": CONTRACT_ADDRESS,
            "owner": owner,
            "owner_short": short(owner),
            "arbitrator": arbitrator,
            "arbitrator_short": short(arbitrator),
            "escrow_count": escrow_count_raw,
            "active_escrows": active_escrows,
            "escrows_complete": bool(escrows_data["complete"]),
            "max_escrows_per_client": max_per_client,
            "locked_wei": str(locked_raw) if locked_raw is not None else None,
            "locked": usdc_fmt(locked_raw),
            "contract_usdc_wei": str(contract_usdc_raw) if contract_usdc_raw is not None else None,
            "contract_usdc": usdc_fmt(contract_usdc_raw),
            "recoverable_wei": str(recoverable_wei),
            "recoverable": usdc_fmt(recoverable_wei),
        },
        "checks": checks,
    }

    # Cache only fully successful reads so a rate-limited RPC can't serve a
    # misleading 'everything is 0/None' safety snapshot.
    if all(v is not None for v in (owner, arbitrator, locked_raw, escrow_count_raw)) and balance_ok:
        _safety_cache["timestamp"] = time.monotonic()
        _safety_cache["data"] = summary
    return summary


class ChatMessage(BaseModel):
    role: str = "user"
    content: str = ""


class ChatRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = []


@app.get("/safety")
def safety() -> Dict[str, Any]:
    """Real contract safety facts for the Safety Center page and the compact
    dashboard card. No invented results: unverifiable values are None."""
    return load_safety_summary()


_ESCROW_ID_RE = re.compile(r"\bescrow\s*(?:id\s*)?#?\s*(\d+)", re.IGNORECASE)


def _format_escrow_for_ai(data: Optional[Dict[str, Any]]) -> Optional[str]:
    """Human-readable one-paragraph summary of an escrow for the LLM prompt."""
    if not data:
        return None
    yes_no = lambda v: "yes" if v else "no"
    created = datetime.fromtimestamp(int(data.get("createdAt") or 0), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    expires = datetime.fromtimestamp(int(data.get("expiresAt") or 0), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"Escrow #{data.get('id')} — current status: {data.get('status', 'unknown')}.\n"
        f"- Client: {data.get('client_short')} ({data.get('client')})\n"
        f"- Freelancer: {data.get('freelancer_short')} ({data.get('freelancer')})\n"
        f"- Amount: {data.get('amount')}\n"
        f"- Funded: {yes_no(data.get('funded'))}, Work submitted: {yes_no(data.get('workSubmitted'))}, "
        f"Approved: {yes_no(data.get('approved'))}, Released: {yes_no(data.get('released'))}, "
        f"Refunded: {yes_no(data.get('refunded'))}, Disputed: {yes_no(data.get('disputed'))}\n"
        f"- Created: {created}, Expires: {expires}"
    )


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest) -> Dict[str, Any]:
    """Hybrid assistant: instant rule-based answers, Gemini LLM fallback.

    If the user's question mentions an escrow ID ("escrow 3", "escrow id 42"),
    fetch that escrow's live on-chain state and inject it into the AI context
    so answers are grounded in real data."""
    context = {
        "chain_name": CHAIN_NAME,
        "chain_id": CHAIN_ID,
        "rpc_url": ARC_RPC_URL,
        "contract_address": CONTRACT_ADDRESS,
    }

    m = _ESCROW_ID_RE.search(req.message)
    if m:
        escrow_id = int(m.group(1))
        if escrow_id > 0:
            data = _fetch_escrow(escrow_id)
            context["escrow_live"] = _format_escrow_for_ai(data) or (
                f"Escrow #{escrow_id} does not exist on the chain "
                "(the contract returned no escrow for that ID)."
            )

    history = [
        {"role": m.role, "content": m.content}
        for m in (req.history or [])
        if m.content.strip()
    ]
    result = await assistant_answer(req.message, history, context)
    return {"answer": result["answer"], "source": result["source"]}
