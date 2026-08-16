# ArcBridge — Session Handoff (Aug 14, 2026)

## ✅ Done & verified (green)

**Contract (`contracts/src/ArcBridgeEscrow.sol`)** — rewritten with:
- `cancelEscrow(id)` — client refund (unfunded: any time; funded: after expiry + no submission)
- Expiry timelock — `expiresAt` (default 7 days, `setDefaultDuration` / per-escrow `createEscrowWithDeadline`)
- `claimAfterExpiry(id)` — freelancer protection if client never approves
- Dispute/arbitration — `disputeEscrow`, `resolveDispute(id, favorFreelancer)` (arbitrator-only, `setArbitrator`)
- New fields: `refunded`, `disputed`, `createdAt`, `expiresAt` · events: `EscrowCancelled`, `DisputeRaised`, `DisputeResolved`
- `forge test`: **46/46 pass** (44 escrow + 2 counter). `via_ir` enabled in foundry.toml (stack-too-deep)

**Deploy** — NEW contract LIVE: `0x788bd809f93b8915f0dcd1ab3b3560355c8d0ff3`
- Tx: `0x06c5f558f50446c29d793568e757cad1c0dacbbceff0ddb376e85fffade9564e`
- Verified: escrowCount=0 (fresh), maxEscrowsPerClient=50, lockedBalance=0, arbitrator=deployer `0x36a7...` — **✅ ArcScan source verified**
- New features: `rescueTokens` (USDC-excess only, escrow funds protected), `setMaxEscrowsPerClient` (spam cap), `lockedBalance`/`clientEscrowCount` state — forge tests **60/60 pass**
- Updated in: `frontend/src/contracts/config.js` + `backend/main.py` default + `.env.example` files + README
- Previous address `0xabba73911a892fe33bd8f173608075f89cd0b757` fully removed from project

**Backend (`backend/main.py`)** — all fixes verified:
- `time_ago` block-number bug → real block timestamps
- CORS `*`+credentials → explicit origins, credentials off
- `@app.on_event` → lifespan; parallel escrow reads; background poller (cold start 0.02s, was 33s)
- No cache poisoning on RPC 429
- **Event feed root-cause fix**: web3 v7.16 requires `"anonymous": False` on every event ABI — was silently crashing get_logs decode (feed NEVER worked before). Now verified: 8 events decoded incl. DisputeRaised + DisputeResolved (2.00 + 3.00 USDC)
- Retry + logging on scan failures; BACKFILL_BLOCKS raised

**Frontend** — build ✅, oxlint 0 warnings:
- `wallet.js` hardcoded approve address → `CONTRACT_ADDRESS` import
- `CreateEscrow.jsx`: Cancel Escrow / Dispute / Resolve→Freelancer / Resolve→Client buttons
- `Dashboard.jsx`: `Disputed`/`Refunded` badges, 3 new events in activity feed
- `Dashboard.jsx`: **single `getLogs` with OR'd topics** (was 8 parallel calls → RPC burst limit ~3-5 → feed always failed). Also loads feed without wallet (public RPC fallback)

## ⏭️ Where to continue (pending)

1. **Verify frontend activity feed live** — after the single-getLogs fix, the preview was never re-confirmed. Escrow #3 (id=3) was created for exactly this: its events are within the 5000-block window. Start dev server (`cd frontend && npm run dev`), open preview, check the activity feed shows the new events.
2. Escrow #3's full lifecycle (deposit → submit → dispute → resolve) was NOT completed — only creation.
3. Consider showing dispute/cancel/claim buttons per-status in Dashboard (currently on CreateEscrow page only).

## ⚠️ Gotchas

- **Public testnet RPC heavily rate-limited (429)** — burst limit ~3-5, rolling window. Backend poller + browser queries from same IP compound it. Space out RPC calls; poller grinds slowly through backfill. `get_logs` on large ranges triggers it fast.
- Chain is very fast (~1000 blocks/min) — events age out of small scan windows quickly.
- `forge` at `$HOME/.foundry/bin` — export PATH before use.
- **Untracked (not in git):** whole `backend/`, `contracts/test/ArcBridgeEscrow.t.sol`, `frontend/src/hooks/useLiveChainData.js`, `frontend/src/lib/`, `pnpm-lock.yaml`/`pnpm-workspace.yaml`, `.freebuff/`. Commit needs user permission.
- Deployed contract is fresh → app shows 0 escrows until new ones are created.

## 📱 Mobile "Desktop site" mode fix (force-mobile)

- Mobile browsers in Desktop-site mode force a ~980px layout viewport and ignore the viewport meta → the app fell back to broken desktop CSS (tiny/cramped UI).
- Fix: inline script in `index.html` detects touch device + `screen.width <= 600` + `innerWidth > screen.width + 100`, then adds a `force-mobile` class + `--fm-k`/`--fm-w` vars on `<html>`. `force-mobile.css` (auto-generated via `npm run gen:force-mobile`) re-emits every mobile `@media` block scoped under `html.force-mobile`, `zoom` cancels the browser's fit-to-screen scale, and `#root` is constrained to the physical screen width. `Sidebar.jsx` also treats the class as mobile so the drawer shows.
- Verified: with all 15 max-width media rules deleted from the live CSSOM, the class alone restored the full mobile layout (navbar padding, drawer, grids). Real desktop and normal mobile are untouched — the class is only added when desktop-mode-on-a-phone is detected.
- To keep in sync after editing mobile CSS: `cd frontend && npm run gen:force-mobile`.
- Refinements: app column is left-aligned (margin 0 — auto-centering would land at CSS ~310, off-screen at net 1:1); settings/escrow modal overlays are constrained to the app column so they stay centered; a dismissible `ForceMobileBanner` (📱 "Desktop site mode on hai…") shows at the bottom when the class is active (auto-hides 8s, session-dismissible).
- **Settings toggle** ("Mobile — Desktop Site Mode → Force mobile layout"): user can turn the force-mobile behaviour off to see the real desktop layout in Desktop-site mode. Persisted as `localStorage['arcbridge-force-mobile']` (default on), applied live via `window.__arcApplyForceMobile()` exposed by the index.html script. Guarded so it can never apply on a real desktop / normal mobile.

## 🤖 Hybrid AI Assistant (rule-based + Gemini)
- **Backend:** `assistant.py` (no imports from main — context passed in) + `POST /api/chat` in main.py. `answer()` = rules → LLM → fallback. Knowledge base: 20 intents (escrow lifecycle, dispute/cancel/refund, wallet, gas, statuses, settings, analytics, security…) with Hinglish answers + `{placeholder}` live context (chain, contract).
- **LLM:** Gemini REST (`generateContent`, default `gemini-2.5-flash` free tier). `GEMINI_API_KEY` in backend/.env — WITHOUT a key the rules still answer everything + a friendly fallback for custom questions. 429/timeout handled gracefully.
- **Frontend:** `ChatWidget.jsx` (floating 🤖 FAB bottom-right) — quick replies, typing dots, markdown-lite rendering (bold + bullets), backend-down error bubble. `liveApi.js` → `chatWithAssistant()`. Rendered on landing + app views.
- **Tests:** `tests/test_assistant.py` (10 new; 48 total pass). `.env.example` + README "AI Assistant" section updated.
- Widget is right-anchored → works under force-mobile too (ICB ≈ 360 CSS on phone).
- **Bilingual update:** every KB intent now has EN + HI/Hinglish answers; `detect_language()` (Devanagari or distinctive Hinglish tokens) picks the matching one — English question → English answer, Hinglish/Devanagari → Hindi. LLM system prompt got a strict "match the user's language" rule + detected-language hint. KB expanded 20 → 25 intents (what_is_escrow, min_amount, escrow_id, wrong_address/rescue, release_time, production/mainnet). "escrow" removed from Hinglish tokens, "ai" keyword dropped (substring false positives). Tests: 67 pass (incl. EN/HI matching).
- **Professional rewrite:** all 25 KB answers rewritten emoji-free with a consistent structure (short intro → numbered steps → outcome), English + polite Hindi/Hinglish. LLM persona = "senior support engineer" with strict no-emoji/no-slang + language-match rules; fallbacks professionalized. Facts corrected to match the contract (amount > 0 — no 1 USDC minimum; cap 50; rescue above locked funds only). Frontend widget: "ArcBridge Support" header, sparkle avatar + SVG send button (no 🤖/➤), professional welcome + quick replies + error copy.
