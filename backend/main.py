from __future__ import annotations

import asyncio
import json
import os
import random
import re
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from web3 import Web3
from web3._utils.events import event_abi_to_log_topic
from dotenv import load_dotenv

# Load backend/.env (RPC, contract, GEMINI_API_KEY, ...) BEFORE importing
# assistant, which reads GEMINI_API_KEY at module import time. Resolve the path
# relative to this file so the backend works regardless of the launch CWD.
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

from assistant import answer as assistant_answer


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    """Parse an integer env var, falling back to the default on missing or
    invalid values so a typo can't crash the server at import time."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        print(f"[config] invalid {name}={raw!r}, using default {default}", flush=True)
        return default
    return max(minimum, value)


ARC_RPC_URL = os.getenv("ARC_RPC_URL", "https://rpc.testnet.arc.network")
CONTRACT_ADDRESS = Web3.to_checksum_address(
    os.getenv("CONTRACT_ADDRESS", "0xa12b4775b2eb4741aabbb8e2aade41e9ad0665e4")
)
USDC_ADDRESS = Web3.to_checksum_address(
    os.getenv("USDC_ADDRESS", "0x3600000000000000000000000000000000000000")
)
CHAIN_NAME = os.getenv("CHAIN_NAME", "Arc Testnet")
CHAIN_ID = _env_int("CHAIN_ID", 5042002)
POLL_SECONDS = _env_int("POLL_SECONDS", 8, minimum=3)
RECENT_BLOCKS = _env_int("RECENT_BLOCKS", 2000, minimum=1)
# Small window scanned every poll cycle so the live feed stays current even
# when the RPC is rate-limited; backfill covers the rest gradually.
RECENT_SCAN_BLOCKS = _env_int("RECENT_SCAN_BLOCKS", 400, minimum=50)
# How far back to look for events on startup (feed backfill). Arc testnet is
# very fast (~1000 blocks/min), so the default covers a meaningful slice. The
# poller grinds through this window in MAX_SCAN_BLOCKS chunks so a slow or
# rate-limited RPC doesn't get blasted with one huge get_logs range.
BACKFILL_BLOCKS = max(RECENT_BLOCKS, _env_int("BACKFILL_BLOCKS", 60000))
# Max blocks scanned per poll cycle; keeps each cycle cheap and RPC-friendly.
MAX_SCAN_BLOCKS = max(RECENT_BLOCKS, _env_int("MAX_SCAN_BLOCKS", 2000))
SAMPLE_ESCROWS = _env_int("SAMPLE_ESCROWS", 12, minimum=4)
# If the total escrow count is at or below this, load every escrow so stats are exact.
MAX_ESCROWS = max(SAMPLE_ESCROWS, _env_int("MAX_ESCROWS", 100))
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
        "type": "function",
        "name": "pendingArbitrator",
        "inputs": [],
        "outputs": [{"name": "", "type": "address"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "arbitratorChangeDeadline",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "function",
        "name": "escrowDurations",
        "inputs": [{"name": "", "type": "uint256"}],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
    },
    {
        "type": "event",
        "name": "ArbitratorChangeScheduled",
        "anonymous": False,
        "inputs": [
            {"name": "newArbitrator", "type": "address", "indexed": True},
        ],
    },
    {
        "type": "event",
        "name": "ArbitratorChanged",
        "anonymous": False,
        "inputs": [
            {"name": "newArbitrator", "type": "address", "indexed": True},
        ],
    },
    {
        "type": "event",
        "name": "DefaultDurationChanged",
        "anonymous": False,
        "inputs": [
            {"name": "newDuration", "type": "uint256", "indexed": False},
        ],
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
    # Reload any previously-persisted feed events so a restart doesn't wipe the
    # user's transaction history. The poller then merges fresh events on top.
    persisted = _load_events_store()
    if persisted:
        state.recent_events = _backfill_event_timestamps(persisted)
        _save_events_store(state.recent_events)

    try:
        state.latest_block = int(w3.eth.block_number)
        state.last_scanned_block = max(1, state.latest_block - BACKFILL_BLOCKS)
        state.healthy = True
    except Exception as exc:
        state.healthy = False
        state.error = sanitize_error(exc)

    task = asyncio.create_task(poll_chain())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        _save_events_store(state.recent_events)


app = FastAPI(title="Client2Freelancer Live API", version="1.0.0", lifespan=lifespan)
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

# Map each tracked event's topic0 -> event name so a single contract-wide
# get_logs (no topic filter) can be decoded without 12 separate RPC calls.
_EVENT_TOPIC_TO_NAME: Dict[str, str] = {}
for _entry in ABI:
    if _entry.get("type") == "event":
        _EVENT_TOPIC_TO_NAME[event_abi_to_log_topic(_entry).hex()] = _entry["name"]



@dataclass
class ChainState:
    healthy: bool = False
    error: str = ""
    latest_block: int = 0
    last_scanned_block: int = 0
    last_synced_at: int = 0
    recent_events: List[Dict[str, Any]] = field(default_factory=list)


state = ChainState()


# ---------------------------------------------------------------------------
# Persistent event store: feed events are written to a local JSON file so a
# browser refresh or a backend restart does not wipe the user's transaction
# history. The in-memory list remains the fast read path; the file is only a
# durability backstop that is reloaded on startup.
# ---------------------------------------------------------------------------
_EVENTS_STORE_PATH = os.path.join(_BACKEND_DIR, ".events_store.json")
MAX_STORED_EVENTS = 500


def _load_events_store() -> List[Dict[str, Any]]:
    """Read persisted feed events from disk. Returns [] on any failure."""
    try:
        with open(_EVENTS_STORE_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
    except (OSError, ValueError, TypeError):
        pass
    return []


def _save_events_store(events: List[Dict[str, Any]]) -> None:
    """Persist feed events to disk atomically. Best-effort: a failed write must
    never break the poller, so errors are swallowed."""
    try:
        tmp = _EVENTS_STORE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(events[:MAX_STORED_EVENTS], fh)
        os.replace(tmp, _EVENTS_STORE_PATH)
    except OSError:
        pass


def _backfill_event_timestamps(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Populate each event's absolute block timestamp when missing.

    Older persisted events carry only a `time_ago` snapshot, which freezes at
    scan time and drifts wrong as wall-clock time advances. Resolving each event
    back to its real block time lets the frontend render a correct, live age.
    Best-effort: a failed RPC lookup leaves the event untouched so the feed
    never regresses."""
    for ev in events:
        if ev.get("timestamp"):
            continue
        block = ev.get("block")
        if not block:
            continue
        ts = limited_call(
            lambda b=block: int(w3.eth.get_block(b)["timestamp"]), None
        )
        if ts:
            ev["timestamp"] = int(ts)
            ev["time_ago"] = max(0, now_ts() - int(ts))
    return events


def _event_key(event: Dict[str, Any]) -> tuple:
    """Stable identity for an event: tx hash + block. Used to de-duplicate so a
    re-scan or a poll overlapping an SSE push never shows a row twice."""
    return (event.get("tx_hash"), event.get("block"))


def _merge_events(existing: List[Dict[str, Any]], incoming: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Prepend incoming events onto existing, de-duplicated by (tx, block)."""
    seen = {_event_key(e) for e in existing}
    merged = list(existing)
    for ev in incoming:
        key = _event_key(ev)
        if key in seen:
            continue
        seen.add(key)
        merged.insert(0, ev)
    return merged


def load_full_history() -> List[Dict[str, Any]]:
    """Return the complete persisted activity history, newest first.

    The in-memory list is the fast read path but is capped during polling; the
    JSON store holds the durable, longer history. Merge the two so a browser
    refresh or restart always surfaces the full prior transaction history, not
    just the most recent in-memory slice.
    """
    return _merge_events(_load_events_store(), state.recent_events)


# ---------------------------------------------------------------------------
# Server-Sent Events: a set of asyncio queues, one per connected browser tab.
# The poller pushes freshly-indexed feed events into every queue as soon as a
# scan completes, so the frontend updates in near-real-time instead of waiting
# for its next 30s poll. Each queue is bounded; a slow consumer is dropped
# rather than allowed to grow unbounded and block the poller.
# ---------------------------------------------------------------------------
_sse_subscribers: set[asyncio.Queue] = set()
_sse_max_events = 32


def _broadcast_event(event: Dict[str, Any]) -> None:
    """Push one feed event to every connected SSE subscriber, non-blocking."""
    for queue in list(_sse_subscribers):
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            # Slow consumer: drop the stale queue rather than leak memory.
            _sse_subscribers.discard(queue)


# Simple token-bucket limiter shared by the poller and request-time RPC reads.
# The public Arc testnet RPC bursts at ~3-5 concurrent requests, so we pace
# ourselves to ~2 req/s instead of compounding 429s.
class _RateLimiter:
    def __init__(self, rate: float = 2.0, burst: int = 3):
        self._rate = rate
        self._burst = float(burst)
        self._tokens = float(burst)
        self._last = time.monotonic()
        self._lock = Lock()

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            self._tokens = min(self._burst, self._tokens + (now - self._last) * self._rate)
            self._last = now
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return
        # Out of tokens: wait for the next token.
        wait = (1.0 - self._tokens) / self._rate
        time.sleep(wait)
        with self._lock:
            self._tokens = max(0.0, self._tokens - 1.0)


RPC_LIMITER = _RateLimiter()


def limited_call(fn, default=None):
    """safe_call variant that paces RPC requests through the shared limiter."""
    RPC_LIMITER.acquire()
    return safe_call(fn, default)


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
    "ArbitratorChangeScheduled": {"label": "Arbitrator Change Scheduled", "tone": "neutral", "icon": "🕐"},
    "ArbitratorChanged": {"label": "Arbitrator Changed", "tone": "completed", "icon": "🔑"},
    "DefaultDurationChanged": {"label": "Default Duration Changed", "tone": "neutral", "icon": "⏱️"},
}


def now_ts() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def sanitize_error(exc: Exception) -> str:
    """Human-safe error message for /health and summaries. RPC exception text
    can embed URLs, connection internals or revert data — keep the detail for
    logs, expose a short generic reason to API callers."""
    text = str(exc)
    if not text:
        return "RPC error"
    text = re.sub(r"https?://\S+", "<url>", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:300]


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
    # Handle both tuple-style (web3) and object-style (namedtuple/SimpleNamespace)
    # reads. The tuple path uses explicit indices; the object path falls back to
    # attribute access. If neither works the caller (e.g. _fetch_escrow) treats
    # the escrow as not-found rather than surfacing a 500.
    try:
        if isinstance(raw, (list, tuple)):
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
        else:
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
    except Exception as exc:
        raise ValueError(f"unexpected escrow payload for id {escrow_id}: {exc}") from exc

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
    recipient = args.get("recipient") or args.get("to")
    return {
        "event": name,
        "label": meta["label"],
        "tone": meta["tone"],
        "icon": meta["icon"],
        "escrow_id": str(escrow_id) if escrow_id is not None else None,
        "amount": usdc_fmt(amount) if amount is not None else None,
        "recipient": recipient,
        "block": block_number,
        "tx_hash": tx_hash,
        "time_ago": 0,
        "timestamp": 0,
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
ESCROWS_CACHE_TTL = float(_env_int("ESCROWS_CACHE_TTL", 15))


def _fetch_escrow(escrow_id: int) -> Optional[Dict[str, Any]]:
    raw = limited_call(lambda i=escrow_id: contract.functions.escrows(i).call())
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

    total_raw = limited_call(lambda: int(contract.functions.escrowCount().call()))
    total = total_raw or 0
    # Keep the endpoint bounded: load up to MAX_ESCROWS and report total.
    limit = min(total, MAX_ESCROWS)
    escrows: List[Dict[str, Any]] = []
    fetch_failures = 0
    if limit > 0:
        # Load the NEWEST escrows (highest ids) so the list, filters and stats
        # reflect recent activity even when the chain has more than MAX_ESCROWS.
        # Sequential fetch paced by the shared RPC limiter (the testnet RPC
        # rate-limits bursts of ~3-5, so 4-way parallelism just compounds 429s).
        for escrow_id in range(total, total - limit, -1):
            result = _fetch_escrow(escrow_id)
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

    # Reuse the /escrows cache (same bounded, newest-first data) so the poller
    # does not fetch every escrow twice per cycle.
    escrows_data = load_all_escrows()
    escrows = escrows_data["escrows"]

    selected = None
    if escrows:
        selected = escrows[0]

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
        "recent_escrows": escrows[:6],
        "selected_escrow": selected,
        "stats": stats,
    }

    # Only cache fully successful builds so a rate-limited RPC can't poison the
    # cache with a misleading "0 escrows" snapshot.
    if escrows_data["complete"]:
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

    address = (address or "").strip()
    if not Web3.is_address(address):
        return {
            "connected": False,
            "address": "--",
            "short_address": "--",
            "network": CHAIN_NAME,
            "usdc_balance": "--",
            "allowance": "--",
            "error": "Invalid address",
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


def _get_logs_with_retry(fn, from_block: int, to_block: int, attempts: int = 3) -> List[Any]:
    """Call fn() (a get_logs call) with rate-limit-aware retries.

    429/503 means "slow down for a while", so we sleep longer between attempts
    (respecting Retry-After when present) instead of hammering with short
    retries, which is what makes the Arc testnet RPC worse. Non-rate-limit
    errors retry with a short backoff. After attempts all fail, the caller
    treats the window as incomplete and the poller retries next cycle."""
    last_error: Optional[Exception] = None
    for attempt in range(attempts):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001 - surface any RPC failure
            last_error = exc
            text = str(exc)
            is_rate_limit = "429" in text or "Too Many Requests" in text or "503" in text
            retry_after = _rpc_retry_after(exc)
            if is_rate_limit:
                # A long, single pause — the RPC needs time to refill.
                time.sleep(min(retry_after if retry_after is not None else 12.0, 20.0))
            else:
                delay = min(6.0, (1.5 ** attempt)) + random.uniform(0, 0.4)
                time.sleep(delay)
    raise last_error  # type: ignore[misc]


def _rpc_retry_after(exc: Exception) -> Optional[float]:
    """Read the Retry-After header from an httpx HTTPStatusError (429/503)."""
    try:
        resp = exc.response  # type: ignore[attr-defined]
        if resp is not None and "Retry-After" in resp.headers:
            return float(resp.headers["Retry-After"])
    except Exception:
        pass
    return None


def scan_new_events(from_block: int, to_block: int) -> tuple[List[Dict[str, Any]], bool]:
    """Scan the block window for all tracked events.

    Returns (events, complete). complete is False when the scan failed after
    retries, so the poller can avoid advancing past the window — otherwise the
    events in that gap would be dropped from the feed forever.

    Fast path: a single contract-wide get_logs (no topic filter), decoded via
    the topic->event map. The public Arc testnet RPC rejects OR'd multi-topic
    get_logs, but a topic-less address-scoped get_logs is a single, well-formed
    request — so this is both faster (1 call vs 12) and RPC-friendlier.

    Fallback: if the single call fails, fall back to the previous per-event-type
    scan so the feed never regresses on an RPC that rejects the combined shape.
    """
    if from_block > to_block:
        return [], True

    block_time_cache: Dict[int, int] = {}

    def _decorate(raw_logs: List[Any]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for log in raw_logs:
            topic = None
            topics = log.get("topics") or []
            if topics:
                t0 = topics[0]
                topic = t0.hex() if hasattr(t0, "hex") else str(t0)
            event_name = _EVENT_TOPIC_TO_NAME.get(topic)
            if not event_name:
                continue

            try:
                event_class = contract.events[event_name]
                decoded = event_class.process_log(log)
                args = dict(decoded["args"]) if "args" in decoded else {}
            except Exception:
                args = {}

            tx_hash = log.get("transactionHash")
            tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            block_number = int(log.get("blockNumber", 0))
            item = event_item(event_name, args, block_number, tx_hash)

            timestamp = block_time_cache.get(block_number)
            if timestamp is None:
                timestamp = limited_call(
                    lambda b=block_number: int(w3.eth.get_block(b)["timestamp"]), None
                )
                block_time_cache[block_number] = timestamp
            if timestamp:
                item["timestamp"] = int(timestamp)
                item["time_ago"] = max(0, now_ts() - int(timestamp))
            out.append(item)
        return out

    # Fast path: one contract-wide get_logs.
    try:
        def _single_scan() -> List[Any]:
            RPC_LIMITER.acquire()
            return w3.eth.get_logs(
                {
                    "address": CONTRACT_ADDRESS,
                    "fromBlock": from_block,
                    "toBlock": to_block,
                }
            )

        logs = _get_logs_with_retry(_single_scan, from_block, to_block)
        events = _decorate(logs)
        events.sort(key=lambda item: (item["block"], item.get("escrow_id") or ""), reverse=True)
        return events, True
    except Exception as exc:
        print(
            f"[scan_new_events] combined get_logs {from_block}-{to_block} failed "
            f"({exc}); falling back to per-event scan",
            flush=True,
        )

    # Fallback: per-event-type scan (previous behavior).
    events = []
    event_names = list(EVENT_META.keys())
    all_complete = True
    consecutive_failures = 0
    for event_name in event_names:
        try:
            event_class = contract.events[event_name]

            def _do_scan(ec=event_class) -> List[Any]:
                RPC_LIMITER.acquire()
                return ec().get_logs(from_block=from_block, to_block=to_block)

            logs = _get_logs_with_retry(_do_scan, from_block, to_block)
            consecutive_failures = 0
        except Exception as exc:
            print(f"[scan_new_events] {event_name} {from_block}-{to_block} failed: {exc}", flush=True)
            all_complete = False
            logs = []
            consecutive_failures += 1
            if consecutive_failures >= 3:
                break

        for log in logs:
            args = dict(log["args"]) if "args" in log else {}
            tx_hash = log.get("transactionHash")
            tx_hash = tx_hash.hex() if hasattr(tx_hash, "hex") else str(tx_hash)
            block_number = int(log.get("blockNumber", 0))
            item = event_item(event_name, args, block_number, tx_hash)
            timestamp = block_time_cache.get(block_number)
            if timestamp is None:
                timestamp = limited_call(lambda b=block_number: int(w3.eth.get_block(b)["timestamp"]), None)
                block_time_cache[block_number] = timestamp
            if timestamp:
                item["timestamp"] = int(timestamp)
                item["time_ago"] = max(0, now_ts() - int(timestamp))
            events.append(item)

    events.sort(key=lambda item: (item["block"], item.get("escrow_id") or ""), reverse=True)
    return events, all_complete


async def poll_chain() -> None:
    """Background poller. All blocking web3 work runs in worker threads via
    asyncio.to_thread so the event loop stays free and HTTP requests (which
    run in FastAPI's thread pool) are never stalled by a slow RPC scan."""
    while True:
        try:
            latest = await asyncio.to_thread(lambda: limited_call(lambda: int(w3.eth.block_number), state.latest_block))
            if not latest:
                latest = state.latest_block

            # Always scan the recent window first so the activity feed is live.
            # RECENT_SCAN_BLOCKS is small (a few hundred) — cheap enough to
            # complete even on a rate-limited RPC.
            recent_start = max(1, latest - RECENT_SCAN_BLOCKS)
            scan_complete = True
            if recent_start <= latest:
                new_events, scan_complete = await asyncio.to_thread(scan_new_events, recent_start, latest)
                if new_events:
                    state.recent_events = _merge_events(state.recent_events, new_events)[:200]
                    # Push only brand-new events (newest first) to SSE clients so
                    # the UI updates immediately instead of on its next poll.
                    for ev in new_events:
                        _broadcast_event(ev)
                    _save_events_store(state.recent_events)
                state.latest_block = latest
                state.healthy = True
                state.error = ""
                state.last_synced_at = now_ts()

            # Backfill: grind toward the oldest un-scanned block in chunks.
            # Only attempt backfill when the recent scan succeeded, so a
            # rate-limited RPC never stalls the live feed.
            if scan_complete:
                state._consecutive_failures = 0
                # Cold start: the backfill cursor begins RECENT_BLOCKS back
                # (events older than that are far out of any useful window).
                cursor = (state.last_scanned_block + 1) if state.last_scanned_block else (latest - RECENT_BLOCKS)
                backfill_end = min(latest - 1, cursor + MAX_SCAN_BLOCKS - 1)
                if backfill_end <= recent_start:
                    old_events, backfill_ok = await asyncio.to_thread(scan_new_events, cursor, backfill_end)
                    if old_events:
                        state.recent_events = _merge_events(state.recent_events, old_events)[:200]
                        _save_events_store(state.recent_events)
                    if backfill_ok:
                        state.last_scanned_block = backfill_end
                    else:
                        state._consecutive_failures = getattr(state, "_consecutive_failures", 0) + 1
                else:
                    # Everything up to the recent window is scanned.
                    state.last_scanned_block = recent_start - 1
            else:
                state._consecutive_failures = getattr(state, "_consecutive_failures", 0) + 1

            # Rebuild the cached summary in a worker thread (only cached when
            # the build completes without RPC failures). It reuses the /escrows
            # cache, so this adds at most one escrowCount read per cycle.
            await asyncio.to_thread(lambda: load_chain_summary(use_cache=False))
        except Exception as exc:
            state.healthy = False
            state.error = sanitize_error(exc)
            state._consecutive_failures = getattr(state, "_consecutive_failures", 0) + 1

        failures = getattr(state, "_consecutive_failures", 0)
        # Back off up to 60s on repeated scan failures (rate limiting).
        backoff = min(60.0, POLL_SECONDS * (2 ** min(failures, 4)))
        await asyncio.sleep(backoff)


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {
        "ok": state.healthy,
        "latest_block": state.latest_block,
        "last_scanned_block": state.last_scanned_block,
        "error": state.error,
        "rpc_url": ARC_RPC_URL,
        "contract_address": CONTRACT_ADDRESS,
    }


@app.get("/api/events")
async def events_stream():
    """Server-Sent Events feed of new escrow activity.

    The frontend opens this once and receives each freshly-indexed event the
    moment the poller scans it — removing the up-to-30s delay of polling
    /api/live. A short keep-alive comment is sent periodically so proxies
    (including Vercel) don't buffer or time out the stream."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=_sse_max_events)
    _sse_subscribers.add(queue)

    async def generator():
        try:
            # Send an initial keep-alive so the connection is established.
            yield ": connected\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            _sse_subscribers.discard(queue)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/history")
def history(limit: int = Query(default=500, ge=1, le=2000), offset: int = Query(default=0, ge=0)) -> Dict[str, Any]:
    """Full persisted activity history (transaction/event feed).

    Merges the durable JSON store with the current in-memory feed, de-duplicated
    by (tx hash, block), so a browser refresh or a backend restart never loses
    prior on-chain activity. Pagination matches /escrows (limit/offset)."""
    events = load_full_history()
    total = len(events)
    page = events[offset : offset + limit]
    return {
        "events": page,
        "total": total,
        "limit": limit,
        "offset": offset,
        "synced_at": state.last_synced_at,
    }


@app.get("/api/live")
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
        # _fetch_escrow treats the zero-address placeholder as not-found, so a
        # nonexistent id never surfaces as a fake "Waiting" escrow here.
        fetched = _fetch_escrow(escrow_number)
        if fetched is not None:
            selected = fetched

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


@app.get("/api/escrow/{escrow_id}")
def escrow_detail(escrow_id: int) -> Dict[str, Any]:
    # _fetch_escrow treats the contract's zero-address placeholder for
    # nonexistent IDs as not-found, so callers never get a fake "Waiting"
    # escrow.
    data = _fetch_escrow(escrow_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Escrow not found")
    return data


@app.get("/api/escrows")
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
SAFETY_CACHE_TTL = float(_env_int("SAFETY_CACHE_TTL", 10))


def load_safety_summary(use_cache: bool = True) -> Dict[str, Any]:
    """Real on-chain safety facts for the Safety Center. All reads are cheap
    eth_call view reads (no get_logs), cached on a short TTL. Values that
    cannot be verified are reported as None so the UI can show 'Not verified'
    instead of inventing results."""
    now = time.monotonic()
    if (
        use_cache
        and _safety_cache["data"] is not None
        and now - _safety_cache["timestamp"] < SAFETY_CACHE_TTL
    ):
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
    wallet: str = ""


@app.get("/api/safety")
def safety() -> Dict[str, Any]:
    """Real contract safety facts for the Safety Center page and the compact
    dashboard card. No invented results: unverifiable values are None."""
    return load_safety_summary()


_ESCROW_ID_RE = re.compile(r"\bescrow\s*(?:id\s*)?#?\s*(\d+)", re.IGNORECASE)


def _format_escrow_for_ai(data: Optional[Dict[str, Any]]) -> Optional[str]:
    """Human-readable summary of an escrow for the LLM prompt, with a clear
    expiry status so the model can give a precise, stage-aware next action."""
    if not data:
        return None
    yes_no = lambda v: "yes" if v else "no"
    created = datetime.fromtimestamp(int(data.get("createdAt") or 0), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    expires = datetime.fromtimestamp(int(data.get("expiresAt") or 0), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    expires_at = int(data.get("expiresAt") or 0)
    if expires_at <= 0:
        expiry_note = "not yet set (the expiry clock starts only when the escrow is funded)"
    else:
        remaining = expires_at - int(datetime.now(timezone.utc).timestamp())
        if remaining > 0:
            days = remaining // 86400
            hours = (remaining % 86400) // 3600
            minutes = (remaining % 3600) // 60
            expiry_note = (
                f"{expires} (about {days}d {hours}h {minutes}m remaining)"
                if days
                else f"{expires} (about {hours}h {minutes}m remaining)"
            )
        else:
            expiry_note = f"{expires} (EXPIRED — the timelock has passed)"

    return (
        f"Escrow #{data.get('id')} — current status: {data.get('status', 'unknown')}.\n"
        f"- Client: {data.get('client_short')} ({data.get('client')})\n"
        f"- Freelancer: {data.get('freelancer_short')} ({data.get('freelancer')})\n"
        f"- Amount: {data.get('amount')}\n"
        f"- Funded: {yes_no(data.get('funded'))}, Work submitted: {yes_no(data.get('workSubmitted'))}, "
        f"Approved: {yes_no(data.get('approved'))}, Released: {yes_no(data.get('released'))}, "
        f"Refunded: {yes_no(data.get('refunded'))}, Disputed: {yes_no(data.get('disputed'))}\n"
        f"- Created: {created}, Expires: {expiry_note}"
    )


@app.post("/api/chat")
async def chat_endpoint(req: ChatRequest) -> Dict[str, Any]:
    """Hybrid assistant: instant rule-based answers, Gemini LLM fallback.

    Builds a live context from real chain data so answers can be personalized:
    - The user's connected wallet (USDC balance + allowance + role on any
      escrow referenced in the question).
    - Any escrow ID mentioned in the question ("escrow 3", "escrow id 42") —
      its full on-chain lifecycle state.
    All RPC reads run in worker threads so a slow/rate-limited RPC never
    freezes the event loop."""
    context = {
        "chain_name": CHAIN_NAME,
        "chain_id": CHAIN_ID,
        "rpc_url": ARC_RPC_URL,
        "contract_address": CONTRACT_ADDRESS,
    }

    # 1) Escrow referenced in the message -> fetch live on-chain state.
    m = _ESCROW_ID_RE.search(req.message)
    escrow_id = int(m.group(1)) if m else None
    if escrow_id and escrow_id > 0:
        data = await asyncio.to_thread(_fetch_escrow, escrow_id)
        context["escrow_live"] = _format_escrow_for_ai(data) or (
            f"Escrow #{escrow_id} does not exist on the chain "
            "(the contract returned no escrow for that ID)."
        )
        if data:
            context["escrow_data"] = data

    # 2) Wallet supplied by the frontend -> enrich with balance/allowance and
    #    the caller's role on the referenced escrow (client / freelancer /
    #    arbitrator / observer). This is what lets the Copilot give exact,
    #    role-specific next steps instead of a generic walkthrough.
    wallet = (req.wallet or "").strip()
    if wallet and Web3.is_address(wallet):
        checksum = Web3.to_checksum_address(wallet)
        balance = await asyncio.to_thread(
            lambda: safe_call(lambda: usdc.functions.balanceOf(checksum).call(), None)
        )
        allowance = await asyncio.to_thread(
            lambda: safe_call(
                lambda: usdc.functions.allowance(checksum, CONTRACT_ADDRESS).call(), None
            )
        )
        arb = await asyncio.to_thread(
            lambda: safe_call(lambda: contract.functions.arbitrator().call(), None)
        )

        context["wallet_live"] = {
            "address": checksum,
            "short_address": short(checksum),
            "usdc_balance": usdc_fmt(balance) if balance is not None else None,
            "allowance": usdc_fmt(allowance) if allowance is not None else None,
            "is_arbitrator": bool(arb and str(arb).lower() == checksum.lower()),
        }

        if escrow_id and context.get("escrow_data"):
            esc = context["escrow_data"]
            esc_client = str(esc.get("client") or "").lower()
            esc_free = str(esc.get("freelancer") or "").lower()
            if esc_client == checksum.lower():
                context["wallet_live"]["role"] = "client"
            elif esc_free == checksum.lower():
                context["wallet_live"]["role"] = "freelancer"
            else:
                context["wallet_live"]["role"] = "observer"

    history = [
        {"role": m.role, "content": m.content}
        for m in (req.history or [])
        if m.content.strip()
    ]
    result = await assistant_answer(req.message, history, context)
    return {"answer": result["answer"], "source": result["source"]}
