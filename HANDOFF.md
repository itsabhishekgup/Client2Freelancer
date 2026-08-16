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

## 🤖 Copilot — Why Arc intent
- **assistant.py:** new `why_arc` intent (13 keywords EN/HI: "why arc", "what is arc", "arc network kya hai", "why did you choose arc"…) — bilingual answer: 5 reasons (USDC native gas, sub-second finality, native USDC no bridge, EVM-compatible, Circle-built) + pointer to Sidebar > Why Arc page + 5 real resource links (arc.io, docs.arc.network, testnet.arcscan.app, faucet.circle.com, github.com/circlefin/arc-node).
- **Matcher improvement:** `_score` now returns `(longest_keyword_len, hit_count)` — a specific long phrase ("why did you choose arc network") beats generic words ("network" x2 in contract_info). All prior matches still pass.
- **Verified live:** EN + HI Why Arc answers via rules (no API needed) ✓, "contract address kya hai" still → contract_info (no regression) ✓, 87/87 tests (3 new).

## 🔗 Why Arc — resources section
- **WhyArc.jsx:** new `RESOURCES` array (5 real links, web-verified): Arc official site (arc.io), Arc documentation (docs.arc.network), Arc Testnet explorer (testnet.arcscan.app), Arc faucet (faucet.circle.com — free testnet USDC), GitHub Arc node (github.com/circlefin/arc-node). Each renders as a card with ↗ icon + title + description, `target="_blank" rel="noopener noreferrer"`. Placed between the comparison table and the network-details table.
- **CSS:** `.whyarc-resource` cards (flat Linear style, hover border accent); force-mobile regenerated.
- **Verified live:** 5 resource cards render with correct hrefs + target blank; mobile screenshot shows all 5 cards cleanly. Build ✓ lint 0 ✓.

## 📊 Why Arc — comparison table
- **WhyArc.jsx:** new `COMPARISON` data (6 rows: Gas/fees, Finality, Native settlement asset, Bridge risk, Purpose-built, Privacy) — Arc column (USDC gas, sub-second finality, native USDC no wrapping, no bridge risk, stablecoin finance, opt-in privacy) vs General-purpose chains (ETH-denominated volatile fees, rollup-dependent finality, bridged USDC.e, bridge risk, general dApps, public-only) + short intro note. Rendered as a 3-column table (Aspect | Arc | General-purpose) between the highlights and the network-details table.
- **CSS:** `.whyarc-compare-*` styles; mobile (≤768px) drops the General-purpose column → clean 2-column table. force-mobile regenerated.
- **Verified live:** 6 rows render (Aspect/Arc/General-purpose headers correct), mobile screenshot shows 2-column table with all rows. Build ✓ lint 0 ✓.

## 🔗 Landing footer — Why Arc link
- **Landing.jsx footer:** small "Why Arc?" link after the copyright line (accent-colored, hover underline) — clicking it launches the app directly onto the Why Arc page via `onLaunch("why-arc")`. Styles `.landing-footer-link` / `.landing-footer-sep` in dark-theme.css; force-mobile regenerated.
- **Verified live:** link click → app opens straight on Why Arc page (6 cards render) ✓. Build ✓ lint 0 ✓.

## ⚡ Why Arc? — knowledge page
- **Sidebar:** "Why Arc?" button at the very bottom (desktop: between nav and footnote; mobile drawer: after Help Center, before footnote) — opens its own page, not a dashboard section.
- **WhyArc.jsx:** knowledge page with real Arc facts (web-verified, no invented claims): What is Arc (Circle's stablecoin-native EVM L1), 6 highlight cards (USDC native gas, deterministic sub-second finality, EVM-compatible, built-in FX engine, opt-in privacy, built by Circle), 4 "Why ArcBridge chose Arc" reasons (dollar fees, fast finality, native USDC no bridges, EVM tooling), and a live network-details table (Arc Testnet, Chain 5042002, USDC 6 decimals, contract 0x788BD809…D0ff3, testnet.arcscan.app). CTA buttons back to dashboard/create.
- **App.jsx:** `isWhyArcPage` branch renders `<WhyArc/>`; **dark-theme.css:** `.whyarc-*` styles (flat Linear-consistent cards/tables) + `.sidebar-whyarc-btn`; force-mobile regenerated (mobile: grid → 1 column).
- **Verified live:** sidebar button present (desktop + mobile drawer) ✓, page renders 6 cards + 4 reasons + 6 network rows ✓, back button works ✓. Build ✓ lint 0 ✓.

## 🎯 Escrow Copilot — live escrow context injection
- **main.py `/api/chat`:** regex `_ESCROW_ID_RE` (`escrow 3`, `escrow id 42`, `escrow #7`) → `_fetch_escrow(id)` live on-chain read → `_format_escrow_for_ai()` builds a human-readable block (status, client/freelancer full + short, amount, all lifecycle flags, created/expires UTC) injected into the AI context.
- **assistant.py:** `_llm_prompt` appends a "LIVE ON-CHAIN ESCROW DATA — use as ground truth" section; `answer()` prefers the LLM over rules **whenever escrow_live context exists** (a generic rule answer would ignore the escrow the user asked about), falling through to rules only if the LLM is unavailable.
- **Zero-address guard in `_fetch_escrow`:** non-existent escrows (contract returns 0x0...0) now return None instead of a fake "Waiting" escrow; the chat context then tells the AI "Escrow #N does not exist on the chain" so it answers honestly. Safe for `/escrows` (IDs are sequential within escrowCount).
- **Verified live:** "What is the status of escrow 3?" → llm: Released / 8.00 USDC / real addresses ✓ · "escrow 3 mein paise kyun nahi mile?" → Devanagari Hindi with live state ✓ · "escrow 99" → "does not exist on the Arc Network" ✓ · rules questions (no escrow ID) still hit `rules` ✓ · preview widget shows the live-status answer ✓ · 84/84 tests (2 new).

## 🔑 Gemini AI — LIVE (key + model fix)
- **backend/.env created** (gitignored) with the user's Gemini API key. `main.py` now calls `load_dotenv()` BEFORE `from assistant import ...` — assistant reads `GEMINI_API_KEY` at import time, so the previous order left it empty in the server (worked in direct scripts, fell back in the API).
- **Model fix:** `gemini-2.5-flash` returns 404 for new users ("no longer available to new users" — 2.5 shuts down Oct 2026). Updated to **`gemini-3.1-flash-lite`** (verified 200) in `assistant.py` default, `.env`, `.env.example`, README. (`gemini-3.5-flash` was 503 high-demand at test time.)
- **Verified live:** `/api/chat` — "What is the meaning of life?" → `source: llm` ✓ · "Do I need to pay tax..." → llm ✓ · Hindi bonus question → **Devanagari Hindi llm answer** ✓ · rules questions still hit `rules` (fast path) ✓ · 82/82 tests · preview widget: custom onboarding question → full AI answer renders with chain ID + RPC ✓.

## 🤖 Escrow Copilot — renamed + A-to-Z trained
- **Branding:** 'ArcBridge Support' → **Escrow Copilot** everywhere — ChatWidget header/FAB aria/welcome, backend greeting + bot_identity answers, Gemini system prompt persona. Quick replies: added 'Why are my funds not released?' chip.
- **Training (12 new intents, 20 → 32):** `funds_not_released` (4-step diagnosis: funded→submitted→approved→released), `tx_failed` (gas/network/approval/role), `wrong_network` (Chain ID 5042002), `allowance`, `escrow_not_found`, `who_arbitrator`, `cancel_after_funded`, `escrow_limit` (per-client cap), `rescue_process` (Safety Center), `refund_timing`, `contact_support`, `data_refresh` (30s auto-refresh + Settings). All bilingual EN/HI.
- **Tie-break fix in `match_intent`:** `_score` returns `(hits, longest_keyword_len)` tuple — specific phrase ('usdc not approved') now beats a generic word ('approve') in an earlier intent. Also added exact 'who is the arbitrator' keyword.
- **Verified live:** 82/82 tests pass; curl — 'Why my funds not released?' → EN rules diagnosis ✓, 'transaction failed kyun ho raha hai' → HI ✓, refund/revert/cap/arbitrator → correct intents ✓; preview widget shows Escrow Copilot header + new quick reply → full diagnosis answer renders. Build ✓ lint 0 ✓. README updated.

## 💸 Transactions — Compact + Show more
- **Dashboard.jsx:** default `txVisibleCount` 6 → **3** (last 3 tx shown), show-more increment +6 → **+3**. Item layout redesigned: flex row with 28px icon tile (activity emoji, tinted), label + shortened tx hash left, block + time-ago right; padding 14×16 → **9×12**, list gap 12 → 8px, radius 10px.
- **Verified live:** 2 events render compact (🚀 Funds Released + ✅ Work Approved), padding 9px 12px, icon tiles present. Show-more hidden now because only 2 events exist (< 3); it appears once a 3rd event lands. Build ✓ lint 0 ✓.

## 💸 Transactions — Auto-refresh default ON
- **Root cause:** `refreshMs` default was `0` (Off) in `App.jsx` — Transactions/feed/escrow data only loaded on page load, so it looked stale. Settings had the toggle but fresh users defaulted to Off.
- **Fix:** default `30000` (every 30s) in `App.jsx` (`localStorage.getItem("arcbridge-refresh") || 30000` — respects any previously saved user choice, including explicit Off); Settings hint now says "On by default (every 30s)".
- **Verified live:** network log shows `/live` + `/escrows` firing every ~30s (2 rounds in 38s, all 200 OK); Transactions section renders Funds Released / Work Approved with block + tx hash. Build ✓ lint 0 ✓.

## ✦ Create New Escrow — Compact Desktop
- **dark-theme.css:** new `@media (min-width: 769px)` block scoped to `.create-escrow-card`: padding 28→22px, gap 18→13px, section-mark 52→42px, h2 15→16px (tight), inputs min-height 54→44px (padding 10px 13px), action-grid gap 14→10px, buttons min-height 40→36px. Estimated card ~80px shorter on desktop.
- **Mobile untouched:** mobile media rules still win (padding 16px/14px compact, gap 12px, input 48px, buttons 48px). `min-width` block is skipped by the force-mobile generator (desktop rules never leak into force-mobile).
- **Verified:** CSSOM shows all 10 desktop rules present in the 769px media block; computed styles on 318px viewport confirm mobile rules intact (input 48px, card padding 14px 16px); build ✓ lint 0 ✓.

## 📦 My Escrows — Status Icons
- **EscrowCard.jsx:** `StatusIcon` component — small inline SVG glyph per status (no emojis): completed → check-circle, disputed → alert-triangle, refunded → return-arrow, funded → clock, submitted → document, approved → check, waiting → dashed-clock. Rendered inside the status badge.
- **dark-theme.css:** `.status-badge` now `display: inline-flex; align-items: center; gap: 5px` (base rule, so activity-feed badges stay consistent) + `.escrow-status-icon` 12×12px `flex: none`. Base rule auto-applies in force-mobile (no regen needed beyond normal).
- **Verified live:** Escrow #2 Completed shows green check-circle, Escrow #1 Refunded shows yellow return-arrow; icons 12×12 with 6px gap, badge text intact. Build ✓ lint 0 ✓. (Note: mid-block str_replace left orphan `font-weight`/`border` — fixed by restoring `.wallet-badge, .status-badge { font-weight: 600 }`.)

## 💳 Circle Wallet — User-Controlled Wallets (optional)
- **Backend `circle_wallet.py`:** UCW orchestrator using the official `circle-user-controlled-wallets` Python SDK (added to requirements). Endpoints in main.py: `GET /api/circle/config`, `POST /api/circle/login` (email OTP → userToken/challengeId), `POST /api/circle/wallet` (create on ARC-TESTNET — officially supported), `POST /api/circle/wallets` (reuse existing), `POST /api/circle/contract` (escrow action → contract-execution challenge). API key/entity secret stay server-side (never exposed); graceful error when not configured.
- **Frontend:** `lib/circleWallet.js` (lazy-imports `@circle-fin/w3s-pw-web-sdk` — its module crashes at import time in some bundles, so it's loaded on demand and the app never breaks), WalletPanel shows a "Connect with Circle" email-login form (OTP + wallet create + address), CreateEscrow routes all escrow actions (create/deposit/submit/approve/release/cancel/dispute) through the Circle wallet when connected, alongside the existing Reown flow.
- **Env:** `CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`, `CIRCLE_APP_ID` in backend/.env.example + README section. Without credentials: UI shows "Circle not configured" hint, app keeps working normally.
- **Verified:** backend 95/95 tests (8 new circle tests) ✓, config + login graceful via live curl ✓, frontend build ✓ lint 0 ✓, preview shows Connect-with-Circle form + hint ✓ (SDK import crash fixed via lazy load).
- **API key set + verified (2026-08-16):** `CIRCLE_API_KEY=TEST_API_KEY:id:secret` (pura string) backend/.env mein — auth pass (401 gone), Circle server respond karta hai. SDK v9.6.0 interface par `circle_wallet.py` port kiya (entity_secret → Configuration attr, `deviceId`+`idempotencyKey` in login, `x_user_token` kwarg, naye request models). Email login ab console ke **SMTP setup** par atka (155150 — Developer Console → SMTP configure karo; code issue nahi). `CIRCLE_APP_ID` bhi console se chahiye. Tests 100/100 — graceful tests env monkeypatch karte hain, configured-path tests SDK mock (no network).
- **PIN login added + LIVE (2026-08-16):** `pin_login(user_id)` in circle_wallet.py (create_user → get_user_token, no SMTP needed), `/api/circle/pin-login` endpoint, WalletPanel mein Email/PIN toggle tabs, `circlePinLogin` in circleWallet.js. **Live verified:** real `userToken` (JWT, authMode=PIN) mila bina SMTP ke. Tests 104/104. README + .env.example updated.
- **Circle session persistence (2026-08-16):** circleWallet.js mein `saveCircleSession`/`loadCircleSession`/`clearCircleSession` + `circleTokenExpiry` (JWT `exp` decode). WalletPanel mount pe session restore karta hai (reload pe re-login nahi), expired token pe clear + "session expired" toast, connect pe save, disconnect pe clear. **Preview verified:** valid session reload pe restore (Circle Wallet badge + address + Disconnect), expired session reload pe cleared + login form wapas. Build ✓ lint 0 ✓.
- **Unified wallet disconnect (2026-08-16):** `useWalletBridge.js` mein `useDisconnect` (AppKit) expose kiya. WalletPanel mein `handleDisconnect` ab **dono wallets ek saath** clean karta hai — Reown/AppKit disconnect + Circle session clear + localStorage wipe. Header mein "🔌 Disconnect All Wallets" button jab koi bhi wallet connected ho (Reown, Circle, ya dono). **Preview verified:** Circle session seeded → button visible → click → session cleared, badge gone, login form wapas. Build ✓ lint 0 ✓.

## 🛡️ Safety Center
- **Backend:** `GET /safety` in main.py (`load_safety_summary` + `_safety_cache`, TTL 10s). Real view reads only (no get_logs): owner, arbitrator, lockedBalance, escrowCount, maxEscrowsPerClient + USDC `balanceOf(contract)`. Returns `contract.recoverable` = max(0, balance − locked) — the ONLY amount ever rescueable for USDC (contract enforces this in `rescueTokens`), `active_escrows` from the cached escrow list, `checks` (owner_verified / escrow_isolation / contract_readable / chain_healthy). Unverifiable values stay `None` (UI shows "Not verified") — nothing invented. ABI extended + `TokensRescued` added to EVENT_META so rescue events flow through the `/live` feed. Tests: 3 new → 70 pass.
- **Frontend:** new `SafetyCenter.jsx` page (sidebar item 🛡️ between Transactions and Settings; `App.jsx` `isSafetyPage` branch) — 6 sections: (1) Contract Safety stat grid with 🟢/🟡/🔴/⚪ chips, (2) Recovery (real recoverable USDC + optional "check another token" ERC-20 balance read), (3) Recovery Protection — 5 live checks (owner / asset / isolation / destination / contract), (4) Rescue Confirmation panel, (5) Recovery Receipt (real tx hash + block + Arc Explorer link), (6) Security Event Log (real on-chain TokensRescued/FundsDeposited events + session audit trail). Rescue calls the real `rescueTokens(token, recipient)` via signer — owner enforced in UI AND in the tx path AND by the contract; no fake/simulated success. New compact `SafetySummaryCard.jsx` on the dashboard side column (Contract health / Protected Funds / Recoverable / Alerts + "View Safety Center →"). `safety-center.css` (Linear-flat style) added to the force-mobile generator list and regenerated.
- **Verified live:** /safety returns real data (owner 0x36a7…0279, 2 escrows, checks all true); preview shows Safety Center page + dashboard card with correct statuses; backend 70/70 tests; build ✓ lint 0 ✓.
- **Auto-refresh:** Safety Center page + dashboard card refetch /safety (+ live events for the page) every 20s and on tab re-focus; interval pauses when the tab is hidden. Silent refresh failures keep the last good snapshot (no loading flash, no fake "unavailable"); only the initial load shows the loading state / error. Verified live via backend access log (periodic `GET /safety` 200s).
