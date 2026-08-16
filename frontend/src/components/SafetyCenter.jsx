import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, isAddress } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { USDC_ADDRESS } from "../contracts/constants";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { fetchLiveSnapshot, fetchSafety } from "../lib/liveApi";
import { toast, updateToast } from "../lib/toast";
import { formatRelativeTime, shortenAddress } from "../lib/escrowFormat";

const PUBLIC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const TX_EXPLORER_URL = arcTestnet.blockExplorers?.default?.url ?? "";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// Refresh cadence for the live safety snapshot. The backend /safety endpoint
// caches for 10s, so 20s polling keeps the page current without hammering RPC.
const POLL_MS = 20000;

const ERC20_MIN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

const explorerLink = (txHash) =>
  TX_EXPLORER_URL && txHash ? `${TX_EXPLORER_URL}/tx/${txHash}` : null;

function toUsdc(value) {
  try {
    return Number(formatUnits(value ?? 0n, 6));
  } catch {
    return 0;
  }
}

// ── Small presentational helpers ─────────────────────────────────────────────

function StatusChip({ state, children }) {
  const map = {
    healthy: { cls: "safety-chip--healthy", dot: "🟢", label: "Healthy" },
    attention: { cls: "safety-chip--attention", dot: "🟡", label: "Attention Required" },
    critical: { cls: "safety-chip--critical", dot: "🔴", label: "Critical" },
    notverified: { cls: "safety-chip--notverified", dot: "⚪", label: "Not verified" },
    verified: { cls: "safety-chip--healthy", dot: "✓", label: "Verified" },
    blocked: { cls: "safety-chip--critical", dot: "❌", label: "Blocked" },
    active: { cls: "safety-chip--healthy", dot: "🟢", label: "Active" },
  };
  const meta = map[state] ?? map.notverified;
  return (
    <span className={`safety-chip ${meta.cls}`} title={meta.label}>
      <span className="safety-chip-dot" aria-hidden="true">
        {meta.dot}
      </span>
      {children ?? meta.label}
    </span>
  );
}

function SafetyStat({ label, value, sub, state }) {
  return (
    <div className="safety-stat">
      <span className="safety-stat-label">{label}</span>
      <strong className="safety-stat-value">{value}</strong>
      {sub ? <span className="safety-stat-sub">{sub}</span> : null}
      {state ? (
        <div className="safety-stat-chip">
          <StatusChip state={state} />
        </div>
      ) : null}
    </div>
  );
}

function CheckRow({ ok, label, detail, verified }) {
  return (
    <div className={`safety-check ${ok ? "safety-check--ok" : "safety-check--fail"}`}>
      <span className="safety-check-icon" aria-hidden="true">
        {ok ? "✓" : "✕"}
      </span>
      <div className="safety-check-body">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      {verified === false ? <span className="safety-check-flag">Not verified</span> : null}
    </div>
  );
}

function AuditRow({ entry }) {
  const kindIcon = {
    requested: "🛟",
    passed: "✓",
    blocked: "✕",
    executed: "✅",
  };
  return (
    <div className="safety-audit-row">
      <span className="safety-audit-icon" aria-hidden="true">
        {kindIcon[entry.kind] ?? "•"}
      </span>
      <div className="safety-audit-body">
        <strong>{entry.label}</strong>
        <span>{entry.detail}</span>
      </div>
      <span className="safety-audit-meta">
        {entry.session ? "This session" : formatRelativeTime(entry.ts)}
      </span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function SafetyCenter({ onNavigate }) {
  const { address: connectedAddress, walletProvider, openConnect } = useWalletBridge();
  const providerSource =
    walletProvider ?? (typeof window !== "undefined" ? window.ethereum : null);

  const [safety, setSafety] = useState(null);
  const [safetyError, setSafetyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [recoverable, setRecoverable] = useState([]);
  const [destination, setDestination] = useState("");
  const [reviewAsset, setReviewAsset] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [pending, setPending] = useState(false);
  const [otherToken, setOtherToken] = useState("");
  const [otherResult, setOtherResult] = useState(null);
  const auditId = useRef(0);

  const contract = safety?.contract;
  const checks = safety?.checks ?? {};

  const addAudit = (kind, label, detail) => {
    const id = ++auditId.current;
    setAudit((prev) => [
      { id, kind, label, detail, ts: Math.floor(Date.now() / 1000), session: true },
      ...prev,
    ]);
  };

  // Load real safety facts + on-chain events. Refreshes every POLL_MS and on
  // tab re-focus so recoverable assets and contract health stay current.
  // Initial failures show an error; silent refresh failures keep last data.
  useEffect(() => {
    let cancelled = false;

    const load = async (initial = false) => {
      if (initial) setLoading(true);
      if (initial) setSafetyError("");

      try {
        const [safetyData, live] = await Promise.allSettled([
          fetchSafety({ signal: null }),
          fetchLiveSnapshot({ signal: null }),
        ]);

        if (cancelled) return;

        if (safetyData.status === "fulfilled") {
          setSafety(safetyData.value);
        } else if (initial) {
          setSafetyError(
            safetyData.reason?.message || "Safety data could not be loaded from the backend.",
          );
        }

        if (live.status === "fulfilled" && Array.isArray(live.value?.events)) {
          // Real on-chain events relevant to safety: rescues + escrow protection
          // (funds locked). Nothing here is fabricated — it all comes from the
          // contract event feed. The feed is a deterministic slice of the most
          // recent events, so replacing wholesale never duplicates rows.
          const safetyEvents = live.value.events
            .filter((ev) => ["TokensRescued", "FundsDeposited"].includes(ev.event))
            .slice(0, 12)
            .map((ev) => ({
              kind: ev.event === "TokensRescued" ? "executed" : "passed",
              label:
                ev.event === "TokensRescued"
                  ? "Recovery Executed"
                  : "Escrow Protection — funds locked",
              detail:
                ev.event === "TokensRescued"
                  ? `${ev.amount ?? ""} rescued to ${shortenAddress(ev.tx_hash)}`.trim()
                  : `${ev.amount ?? ""} locked in escrow #${ev.escrow_id ?? "--"}`,
              ts: Math.floor(Date.now() / 1000) - Number(ev.time_ago ?? 0),
              session: false,
            }));
          setEvents(safetyEvents);
        }
      } catch (err) {
        if (!cancelled && initial) setSafetyError(err?.message || "Failed to load safety data.");
      } finally {
        if (!cancelled && initial) setLoading(false);
      }
    };

    load(true);

    const id = setInterval(() => load(false), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Derive recoverable assets from real contract state. Only the USDC balance
  // ABOVE the locked escrow balance is recoverable (the contract enforces this
  // in rescueTokens). An optional token check adds any other ERC-20 balance.
  const usdcRecoverable = useMemo(() => {
    const wei = contract?.recoverable_wei != null ? BigInt(contract.recoverable_wei) : 0n;
    if (wei <= 0n) return null;
    return {
      id: "usdc",
      token: USDC_ADDRESS,
      symbol: "USDC",
      amountWei: wei,
      amount: `${toUsdc(wei).toFixed(2)} USDC`,
      activeEscrow: false,
      eligible: true,
    };
  }, [contract]);

  useEffect(() => {
    const list = [];
    if (usdcRecoverable) list.push(usdcRecoverable);
    if (otherResult?.token) list.push(otherResult);
    setRecoverable(list);
  }, [usdcRecoverable, otherResult]);

  // Wallet-based authorization facts.
  const ownerAddress = contract?.owner ?? null;
  const isOwner =
    Boolean(connectedAddress) &&
    Boolean(ownerAddress) &&
    String(connectedAddress).toLowerCase() === String(ownerAddress).toLowerCase();
  const walletConnected = Boolean(connectedAddress);

  const destinationOk = Boolean(
    destination && isAddress(destination) && destination.toLowerCase() !== ZERO_ADDRESS,
  );

  const checkOwnerOk = Boolean(isOwner);
  const checkAssetOk = Boolean(contract && contract.recoverable_wei != null);
  const checkIsolationOk = Boolean(checks.escrow_isolation);
  const checkContractOk = Boolean(checks.contract_readable && checks.chain_healthy);

  // Live safety checklist — every check shown is computed from real state.
  const protectionChecks = [
    {
      id: "owner",
      label: "Owner authorization",
      ok: checkOwnerOk,
      verified: ownerAddress != null,
      detail: !walletConnected
        ? "Connect a wallet to verify ownership."
        : ownerAddress == null
          ? "Owner could not be read from the contract."
          : isOwner
            ? `Verified — connected wallet is the contract owner.`
            : `Blocked — connected wallet is not the contract owner (${shortenAddress(ownerAddress)}).`,
    },
    {
      id: "asset",
      label: "Asset verification",
      ok: checkAssetOk,
      verified: contract != null,
      detail:
        contract && contract.recoverable_wei != null
          ? `USDC balance read on-chain — ${contract.contract_usdc}, of which ${contract.locked} is locked in escrows.`
          : "Asset balance could not be verified on-chain.",
    },
    {
      id: "isolation",
      label: "Active escrow isolation",
      ok: checkIsolationOk,
      verified: checks.escrow_isolation != null,
      detail:
        checks.escrow_isolation === false
          ? "Locked balance could not be read — recovery is blocked so escrow funds can never be touched."
          : "Recovery is limited to the balance above locked escrow funds (enforced by the contract).",
    },
    {
      id: "dest",
      label: "Destination validation",
      ok: destinationOk,
      verified: destination !== "",
      detail: !destination
        ? "Enter a destination address."
        : destinationOk
          ? `${shortenAddress(destination)} is a valid address.`
          : "Destination is not a valid address.",
    },
    {
      id: "contract",
      label: "Contract state validation",
      ok: checkContractOk,
      verified: safety != null,
      detail:
        !checks.chain_healthy || !checks.contract_readable
          ? "Contract or chain state could not be fully verified — recovery is blocked."
          : `Contract readable on ${safety?.chain?.name ?? "Arc Testnet"} · block #${safety?.chain?.latest_block ?? "--"}.`,
    },
  ];

  const allChecksPass = protectionChecks.every((c) => c.ok);

  const handleCheckOtherToken = async () => {
    const token = otherToken.trim();
    if (!token || !isAddress(token)) {
      toast("Enter a valid token address", "warning");
      return;
    }
    try {
      setOtherResult(null);
      const provider = new JsonRpcProvider(PUBLIC_RPC_URL);
      const tokenContract = new Contract(token, ERC20_MIN_ABI, provider);
      const [balance, symbol, decimals] = await Promise.all([
        tokenContract.balanceOf(CONTRACT_ADDRESS),
        tokenContract.symbol().catch(() => "TOKEN"),
        tokenContract.decimals().catch(() => 18),
      ]);
      const wei = BigInt(balance?.toString?.() ?? 0);
      if (wei <= 0n) {
        setOtherResult({ token: null, message: `${symbol} balance at the contract is 0.` });
        toast(`${symbol} balance at the contract is 0`, "info");
        return;
      }
      // Non-USDC tokens are rescued in full (no escrow lock applies).
      setOtherResult({
        id: "other",
        token,
        symbol: String(symbol),
        amountWei: wei,
        amount: `${Number(formatUnits(wei, decimals)).toFixed(4)} ${symbol}`,
        activeEscrow: false,
        eligible: true,
      });
      toast(`${symbol} balance found — eligible for recovery review`, "success");
    } catch (err) {
      console.error("token check error:", err);
      setOtherResult({ token: null, message: err?.shortMessage || err?.reason || err?.message });
      toast("Token check failed — verify the address and try again", "error");
    }
  };

  const openReview = (asset) => {
    setReviewAsset(asset);
    addAudit("requested", "Recovery requested", `${asset.amount} from ${shortenAddress(asset.token)}`);
  };

  const closeReview = () => setReviewAsset(null);

  const runRescue = async () => {
    if (!reviewAsset || pending) return;
    setPending(true);

    const pendingToastId = toast("Waiting for confirmation — Rescue Asset…", "pending", {
      duration: 0,
    });

    try {
      const provider = providerSource ? new BrowserProvider(providerSource) : null;
      if (!provider) {
        updateToast(pendingToastId, {
          message: "Please connect a wallet first",
          type: "warning",
          duration: 4500,
        });
        openConnect();
        return;
      }

      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      if (String(signerAddress).toLowerCase() !== String(ownerAddress).toLowerCase()) {
        updateToast(pendingToastId, {
          message: "Recovery blocked — only the contract owner can rescue assets.",
          type: "error",
          duration: 7000,
        });
        addAudit("blocked", "Recovery blocked", "Wallet is not the contract owner.");
        return;
      }

      const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);
      const tx = await contract.rescueTokens(reviewAsset.token, destination.trim());
      const txHash = tx.hash;
      const receipt = await tx.wait();

      setReceipt({
        asset: reviewAsset.amount,
        from: CONTRACT_ADDRESS,
        to: destination.trim(),
        hash: txHash,
        block: receipt?.blockNumber,
        status: receipt?.status === 1 ? "Confirmed" : "Failed",
      });

      addAudit("executed", "Recovery executed", `${reviewAsset.amount} → ${shortenAddress(destination)}`);

      updateToast(pendingToastId, {
        message: "Recovery completed — funds sent to destination.",
        type: "success",
        link: explorerLink(txHash),
        duration: 9000,
      });

      setReviewAsset(null);
      // Refetch so the page reflects the new on-chain balance.
      try {
        const fresh = await fetchSafety({ signal: null });
        setSafety(fresh);
      } catch {
        // Keep the current snapshot; next page load will refresh.
      }
    } catch (err) {
      console.error("rescue error:", err);
      const message = err?.shortMessage || err?.reason || err?.message || "Rescue transaction failed.";
      updateToast(pendingToastId, { message, type: "error", duration: 9000 });
      addAudit("blocked", "Recovery blocked", message);
    } finally {
      setPending(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="dashboard safety-page">
      <section className="dashboard-header">
        <div className="theme-badge">Arc Network • Safety Center</div>
        <h1>Safety Center</h1>
        <p className="dashboard-lead">
          Real-time security status, asset recovery, and escrow protection — verified on-chain.
        </p>
      </section>

      <button type="button" className="help-cta help-back-btn" onClick={() => onNavigate?.("dashboard")}>
        ← Back to Dashboard
      </button>

      {loading && (
        <section className="card dashboard-section">
          <p className="section-copy">Reading contract safety state from the chain…</p>
        </section>
      )}

      {!loading && safetyError && (
        <section className="card dashboard-section">
          <div className="summary-header">
            <div>
              <h3>🛡️ Contract Safety</h3>
              <p>Live on-chain status</p>
            </div>
            <span className="status-badge disputed">Unavailable</span>
          </div>
          <p className="section-copy">
            {safetyError} Start the backend (cd backend && python -m uvicorn main:app --port 8000)
            and reload to see live safety data.
          </p>
        </section>
      )}

      {/* ── 1 · Contract Safety ─────────────────────────────────────────── */}
      {!loading && !safetyError && contract && (
        <section className="card dashboard-section">
          <div className="summary-header">
            <div>
              <h3>🛡️ Contract Safety</h3>
              <p>Live on-chain security overview</p>
            </div>
            <StatusChip state={checks.chain_healthy && checks.contract_readable ? "healthy" : "critical"} />
          </div>

          <div className="safety-stats-grid">
            <SafetyStat
              label="Contract Status"
              value={checks.chain_healthy && checks.contract_readable ? "Healthy" : "Critical"}
              sub={safety?.chain?.name}
              state={checks.chain_healthy && checks.contract_readable ? "healthy" : "critical"}
            />
            <SafetyStat
              label="Authorization / Owner"
              value={isOwner ? "Authorized (you)" : ownerAddress ? shortenAddress(ownerAddress) : "--"}
              sub={ownerAddress ? "Contract owner" : "Unreadable"}
              state={
                ownerAddress == null
                  ? "notverified"
                  : isOwner
                    ? "verified"
                    : "attention"
              }
            />
            <SafetyStat
              label="Escrow Isolation"
              value={checks.escrow_isolation ? "Protected" : "Not verified"}
              sub="Rescue limited to funds above locked escrows"
              state={checks.escrow_isolation ? "healthy" : "notverified"}
            />
            <SafetyStat
              label="Active Escrows"
              value={contract.active_escrows != null ? String(contract.active_escrows) : "--"}
              sub={`${contract.escrow_count ?? "--"} escrows total`}
              state="active"
            />
            <SafetyStat
              label="Protected Funds"
              value={contract.locked ?? "--"}
              sub="Locked in funded escrows"
              state={contract.locked_wei != null && BigInt(contract.locked_wei) > 0n ? "healthy" : "verified"}
            />
            <SafetyStat
              label="Contract Health"
              value={checks.contract_readable ? "Readable" : "Unreachable"}
              sub={`Block #${safety?.chain?.latest_block ?? "--"}`}
              state={checks.contract_readable ? "healthy" : "critical"}
            />
          </div>
        </section>
      )}

      {/* ── 2 · Recovery / Rescue ───────────────────────────────────────── */}
      {!loading && !safetyError && (
        <section className="card dashboard-section">
          <div className="summary-header">
            <div>
              <h3>🛟 Recovery / Rescue</h3>
              <p>Assets recoverable by the authorized contract owner</p>
            </div>
          </div>

          {recoverable.length === 0 ? (
            <div className="safety-empty">
              <strong>No recoverable assets detected</strong>
              <p>
                {contract
                  ? `The contract holds ${contract.contract_usdc ?? "--"} USDC and ${contract.locked ?? "--"} is locked in active escrows — nothing is recoverable right now.`
                  : "Recovery data is unavailable until the contract can be read."}
              </p>
            </div>
          ) : (
            recoverable.map((asset) => (
              <div className="safety-recovery-card" key={asset.id}>
                <div className="safety-recovery-head">
                  <div>
                    <span className="safety-recovery-label">Recovery Opportunity</span>
                    <strong className="safety-recovery-amount">{asset.amount}</strong>
                  </div>
                  <StatusChip state={asset.eligible ? "healthy" : "attention"}>
                    {asset.eligible ? "Eligible" : "Review required"}
                  </StatusChip>
                </div>

                <div className="safety-recovery-rows">
                  <div className="summary-item">
                    <span>Token / Asset</span>
                    <strong>{asset.symbol}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Contract</span>
                    <strong>{shortenAddress(CONTRACT_ADDRESS)}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Active Escrow</span>
                    <strong>No — above locked funds</strong>
                  </div>
                  <div className="summary-item">
                    <span>Owner Authorization</span>
                    <strong>{ownerAddress ? "Verified" : "Not verified"}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Destination</span>
                    <strong>{destinationOk ? shortenAddress(destination) : "—"}</strong>
                  </div>
                  <div className="summary-item">
                    <span>Recovery Status</span>
                    <strong>{asset.eligible ? "Eligible" : "Blocked"}</strong>
                  </div>
                </div>

                <div className="safety-recovery-actions">
                  <input
                    type="text"
                    className="safety-destination-input"
                    placeholder="Destination address (0x…)"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    aria-label="Recovery destination address"
                  />
                  <button
                    type="button"
                    className="premium-action-btn premium-action-btn--approve"
                    onClick={() => openReview(asset)}
                    disabled={!allChecksPass}
                    title={allChecksPass ? "Open recovery review" : "Complete all safety checks first"}
                  >
                    Review Recovery
                  </button>
                  {!allChecksPass && (
                    <span className="safety-recovery-hint">
                      Complete destination + connect owner wallet to enable review.
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Optional: check any other ERC-20 token sent to the contract */}
          <div className="safety-other-token">
            <h4>Check another token</h4>
            <p className="section-copy">
              Tokens accidentally sent to the contract (other than USDC) are rescued in full. Enter
              a token address to check its balance on-chain.
            </p>
            <div className="safety-other-token-row">
              <input
                type="text"
                placeholder="0x… token address"
                value={otherToken}
                onChange={(e) => setOtherToken(e.target.value)}
              />
              <button type="button" className="help-cta" onClick={handleCheckOtherToken}>
                Check balance
              </button>
            </div>
            {otherResult?.message && <p className="safety-other-token-msg">{otherResult.message}</p>}
          </div>
        </section>
      )}

      {/* ── 3 · Recovery Protection ─────────────────────────────────────── */}
      {!loading && !safetyError && (
        <section className="card dashboard-section">
          <div className="summary-header">
            <div>
              <h3>🛡️ Recovery Protection</h3>
              <p>Safety checks run before any rescue transaction</p>
            </div>
            {allChecksPass ? (
              <StatusChip state="healthy">Checks passed</StatusChip>
            ) : (
              <StatusChip state="blocked">Recovery blocked</StatusChip>
            )}
          </div>

          <div className="safety-checks">
            {protectionChecks.map((check) => (
              <CheckRow key={check.id} {...check} />
            ))}
          </div>

          {!allChecksPass && (
            <div className="safety-blocked-note">
              <strong>❌ Recovery Blocked</strong>
              <span>
                {!checkOwnerOk
                  ? "This wallet is not the authorized contract owner — only the owner can rescue assets."
                  : !checkIsolationOk
                    ? "Active escrow isolation could not be verified, so recovery is disabled to protect locked funds."
                    : !checkContractOk
                      ? "Contract state could not be fully verified on-chain."
                      : "Complete the destination field with a valid address to continue."}
              </span>
            </div>
          )}
        </section>
      )}

      {/* ── 4 · Rescue Confirmation ─────────────────────────────────────── */}
      {reviewAsset && (
        <section className="card dashboard-section safety-review">
          <div className="summary-header">
            <div>
              <h3>⚖️ Recovery Review</h3>
              <p>Confirm the rescue transaction before it is sent to your wallet</p>
            </div>
          </div>

          <div className="safety-review-grid">
            <div className="summary-item">
              <span>Asset</span>
              <strong>{reviewAsset.amount}</strong>
            </div>
            <div className="summary-item">
              <span>Amount</span>
              <strong>{reviewAsset.amount}</strong>
            </div>
            <div className="summary-item">
              <span>Source</span>
              <strong>ArcBridge Contract</strong>
            </div>
            <div className="summary-item">
              <span>Destination</span>
              <strong>{destinationOk ? destination : "—"}</strong>
            </div>
            <div className="summary-item">
              <span>Active Escrow</span>
              <strong>No</strong>
            </div>
          </div>

          <div className="safety-checks safety-checks--small">
            <CheckRow ok={checkOwnerOk} label="Authorization verified" detail="Wallet is the contract owner." verified={ownerAddress != null} />
            <CheckRow ok={checkIsolationOk} label="Escrow protection passed" detail="Only funds above locked escrows are sent." verified={checks.escrow_isolation != null} />
            <CheckRow ok={destinationOk} label="Destination validated" detail="Destination is a valid address." verified={destination !== ""} />
            <CheckRow ok={checkContractOk} label="Contract state verified" detail="Contract is readable and chain is healthy." verified={safety != null} />
          </div>

          {!allChecksPass && (
            <div className="safety-blocked-note">
              <strong>❌ Recovery Blocked</strong>
              <span>Complete all safety checks above before the rescue can be reviewed.</span>
            </div>
          )}

          <div className="safety-review-actions">
            <button type="button" className="help-cta" onClick={closeReview} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="premium-action-btn premium-action-btn--rescue"
              onClick={runRescue}
              disabled={!allChecksPass || pending}
            >
              {pending ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Rescuing…</span>
                </>
              ) : (
                "Rescue Asset"
              )}
            </button>
          </div>
        </section>
      )}

      {/* ── 5 · Recovery Receipt ────────────────────────────────────────── */}
      {receipt && (
        <section className="card dashboard-section safety-receipt">
          <div className="summary-header">
            <div>
              <h3>✅ Recovery Completed</h3>
              <p>Transaction confirmed on-chain</p>
            </div>
            <span className="status-badge completed">{receipt.status}</span>
          </div>

          <div className="safety-receipt-grid">
            <div className="summary-item">
              <span>Asset</span>
              <strong>{receipt.asset}</strong>
            </div>
            <div className="summary-item">
              <span>From</span>
              <strong>{shortenAddress(receipt.from)}</strong>
            </div>
            <div className="summary-item">
              <span>To</span>
              <strong>{shortenAddress(receipt.to)}</strong>
            </div>
            <div className="summary-item">
              <span>Network</span>
              <strong>Arc Testnet</strong>
            </div>
            <div className="summary-item">
              <span>Transaction</span>
              <strong>{shortenAddress(receipt.hash)}</strong>
            </div>
            <div className="summary-item">
              <span>Block</span>
              <strong>{receipt.block ?? "--"}</strong>
            </div>
            <div className="summary-item">
              <span>Status</span>
              <strong>{receipt.status}</strong>
            </div>
          </div>

          <div className="safety-review-actions">
            <a
              className="help-cta safety-explorer-link"
              href={explorerLink(receipt.hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on Arc Explorer ↗
            </a>
          </div>
        </section>
      )}

      {/* ── 6 · Security Event Log ──────────────────────────────────────── */}
      {!loading && !safetyError && (
        <section className="card dashboard-section">
          <div className="summary-header">
            <div>
              <h3>📜 Security Event Log</h3>
              <p>Real on-chain events + actions taken in this session</p>
            </div>
            <span className="status-badge live">Live</span>
          </div>

          {(audit.length === 0 && events.length === 0) ? (
            <p className="section-copy">
              No security events yet — rescues and escrow protections will appear here as they
              happen on-chain.
            </p>
          ) : (
            <div className="safety-audit">
              {audit.map((entry) => (
                <AuditRow key={`s-${entry.id}`} entry={entry} />
              ))}
              {events.map((entry, i) => (
                <AuditRow key={`c-${i}`} entry={entry} />
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && !safetyError && !walletConnected && (
        <section className="card dashboard-section safety-wallet-note">
          <p className="section-copy">
            Connect a wallet to check ownership and enable the recovery flow. Reading safety data
            works without a wallet.
          </p>
        </section>
      )}
    </main>
  );
}

export default SafetyCenter;
