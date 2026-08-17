# 🔗 ArcBridge — Programmable USDC Escrow on Arc

> Trustless escrow payments with **on-chain custody, expiry timelocks, and dispute arbitration** — built on the Arc network.

ArcBridge is a full-stack escrow protocol that lets clients and freelancers transact without trusting each other. Funds are locked in a smart contract, work is submitted on-chain, and disputes are resolved by a neutral arbitrator — every step verifiable on-chain.

**Live contract:** [`0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3`](https://testnet.arcscan.app/address/0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3) on Arc Testnet (chain id `5042002`) — **✅ source verified on ArcScan** (Solidity `v0.8.35`, ABI published)

📜 **License:** [MIT](LICENSE) · Copyright © 2026 Abhishek

---

## ✨ Features

### Smart Contract (`ArcBridgeEscrow.sol`)
- **Escrow lifecycle** — create → deposit USDC → submit work → approve → release funds
- **Cancel & refund** — client refunds escrowed funds with a single transaction
- **Expiry timelock** — every escrow has an `expiresAt` (default 7 days, configurable per-escrow via `createEscrowWithDeadline`)
- **`claimAfterExpiry`** — freelancer protection: if the client never approves, funds can be claimed once expired
- **Dispute & arbitration** — either party raises a dispute; the arbitrator (`setArbitrator`, owner-set) resolves it in favor of client or freelancer
- **`rescueTokens`** — owner recovers tokens accidentally sent to the contract; for USDC only the amount above locked escrow balances is touchable, so client funds are never at risk
- **Escrow cap** — `maxEscrowsPerClient` (default 50, owner-configurable) blocks spam: a wallet can never create more than the cap
- **Reentrancy-guarded**, custom `safeTransfer` error handling, `Ownable` admin

### Backend (FastAPI)
- **`GET /health`** — RPC + poller health
- **`GET /live`** — wallet summary, chain state, recent activity events
- **`GET /escrow/{id}`** — single escrow detail
- **`GET /escrows`** — paginated list (`limit`/`offset`) with **status filter** + **search** by id/client/freelancer
- **`POST /api/chat`** — Escrow Copilot: instant rule-based answers (30+ intents, EN/HI, includes troubleshooting) + optional Gemini AI fallback
- Background **poller** keeps a cached view of chain state (no cold-start latency), 15s TTL cache, partial-read safety on RPC rate-limits

### Frontend (React + Vite)
- 🚀 **Landing page** with 2×2 product showcase
- 🌑 **Dark futuristic UI** — glassmorphism, purple/blue neon, accent themes
- 📊 **Analytics dashboard** — wallet overview, escrow summary, activity feed
- ⚙️ **Settings modal** — accent colors, auto-refresh, compact density, default expiry duration, feed toggle
- 💸 **Full escrow actions** — create, cancel, dispute, resolve (per-role buttons)
- 🔔 **Toast system** with tx-hash explorer links + pending-confirmation states
- 🤖 **Escrow Copilot** — floating chat widget (English/Hindi), trained on the full lifecycle incl. troubleshooting, Gemini AI for anything else

---

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   React     │────▶│    FastAPI       │────▶│  Arc Testnet RPC    │
│  Frontend   │     │  (poller + cache)│     │  (chain id 5042002) │
└─────────────┘     └──────────────────┘     └──────────┬──────────┘
       │  wallet connect (AppKit/wagmi)                 │
       └────────────▶  ArcBridgeEscrow.sol  ◀───────────┘
                       (USDC custody + arbitration)
```

- **Contract** — the single source of truth for escrow state (no off-chain trust)
- **Backend** — read-optimized API layer: indexes chain state, serves the activity feed, and absorbs RPC rate-limit pain behind a cache
- **Frontend** — wallet-driven dApp; writes go straight to the contract via wagmi, reads prefer the backend API (with direct RPC fallback)

---

## 🚀 Quickstart

### Prerequisites
- Node 18+ · Python 3.10+ · [Foundry](https://book.getfoundry.sh/) (`curl -L https://foundry.paradigm.xyz | bash`)

### 1. Contracts
```bash
cd contracts
forge build
forge test          # 44 tests: lifecycle, cancel, expiry, dispute, auth
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
# optional: cp .env.example .env  (defaults point at the live testnet contract)
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env   # set VITE_REOWN_PROJECT_ID + VITE_BACKEND_URL
npm run dev            # http://localhost:5173
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Purpose |
|---|---|---|
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` | Arc testnet RPC |
| `CONTRACT_ADDRESS` | `0xabba...` (live) | Escrow contract |
| `USDC_ADDRESS` | `0x3600...` | USDC token |
| `CHAIN_ID` | `5042002` | Chain id |
| `POLL_SECONDS` | `8` | Poller interval |
| `BACKFILL_BLOCKS` | `20000` | Event backfill window |
| `ESCROWS_CACHE_TTL` | `15` | List cache TTL (s) |
| `GEMINI_API_KEY` | _(empty)_ | Free Gemini API key for AI assistant fallback (optional) |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Gemini model used by the assistant |

### Frontend (`frontend/.env`)
| Variable | Purpose |
|---|---|
| `VITE_REOWN_PROJECT_ID` | AppKit wallet-connect project id |
| `VITE_BACKEND_URL` | Backend API base URL |
| `VITE_RPC_URL` | RPC for direct contract reads |
| `VITE_CONTRACT_ADDRESS` | Escrow contract address |
| `VITE_USDC_ADDRESS` | USDC token address |

---

## 🤖 Escrow Copilot (optional AI)

The floating **chat widget** (bottom-right) is **Escrow Copilot** — ArcBridge's
built-in assistant, trained on the full escrow lifecycle:

1. **Instant rules** — a curated knowledge base (30+ intents, English + Hindi)
   answers lifecycle questions AND diagnoses real problems: why funds are not
   released, failed/reverted transactions, wrong network, USDC approval
   missing, escrow not found, cancel-after-funding rules, the per-client cap,
   token recovery (Safety Center), refund timing, and data-refresh issues.
   Works with **zero setup, no API key**, even offline.
2. **Gemini fallback** — questions the rules can't answer go to **Gemini 3.1
   Flash-Lite** (free tier) for real AI responses in the user's language.

Enable the AI part:

```bash
# 1. Get a free key: https://aistudio.google.com/app/apikey
# 2. Put it in backend/.env (copy from .env.example)
GEMINI_API_KEY=your-key-here
# 3. Restart the backend
cd backend && python -m uvicorn main:app --reload --port 8000
```

Without a key the bot still answers every FAQ instantly and politely points
elsewhere for anything custom — the app never breaks because of the AI part.

---

## 💳 Wallet connect

ArcBridge uses the **Reown (WalletConnect) modal** for wallet connections —
users connect their own wallet (e.g. MetaMask-style injected wallets that
support Arc Testnet, or WalletConnect). All escrow actions are signed from
the connected wallet directly.

```bash
# No extra config needed — the connect modal works out of the box.
cd backend && python -m uvicorn main:app --reload --port 8000
```

---

## 🧪 Testing & CI

GitHub Actions runs **all three suites on every push/PR** (see `.github/workflows/ci.yml`):

```bash
# Smart contracts — 44 tests (lifecycle, cancel, expiry, dispute, auth)
cd contracts && forge test && forge fmt --check

# Backend — 32 tests (helpers, endpoints, caching, partial-read safety)
cd backend && pip install -r requirements.txt && python -m pytest tests/ -v

# Frontend lint + build
cd frontend && npx oxlint src && npm run build
```

---

## 📜 Deployment

```bash
cd contracts
source .env   # PRIVATE_KEY + ARC_RPC_URL
forge script script/DeployArcBridgeEscrow.s.sol --rpc-url $ARC_RPC_URL \
  --private-key $PRIVATE_KEY --broadcast
```

Post-deploy, update `CONTRACT_ADDRESS` in `backend/.env` + `VITE_CONTRACT_ADDRESS` in `frontend/.env`.

---

## 📸 Screenshots

<!-- TODO: add screenshots
![Landing](docs/screenshots/landing.png)
![Dashboard](docs/screenshots/dashboard.png)
![Create Escrow](docs/screenshots/create-escrow.png)
![Settings](docs/screenshots/settings.png)
-->

---

## 🛣️ Roadmap

- [x] Contract source verification on ArcScan
- [x] Backend pytest suite + CI pipeline
- [ ] Cross-chain escrow via bridge messaging (LayerZero/Wormhole)
- [ ] Escrow-cap + admin rescue (`sweepTokens`) for mis-sent funds
- [ ] Fiat on/off-ramp integration

---

Built with **Solidity · Foundry · FastAPI · React · ethers.js · AppKit/wagmi** on the **Arc network**.
