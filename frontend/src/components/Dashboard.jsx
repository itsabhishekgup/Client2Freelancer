
import { useEffect, useMemo, useState } from "react";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { USDC_ABI } from "../contracts/USDCABI";
import { USDC_ADDRESS } from "../contracts/constants";
import CreateEscrow from "./CreateEscrow";

const STEPS = [
  "Create Escrow",
  "Approve USDC",
  "Deposit Funds",
  "Submit Work",
  "Approve Work",
  "Release Funds",
];

const ACTIVITY_META = {
  EscrowCreated: { label: "Escrow Created", tone: "completed", icon: "✨" },
  FundsDeposited: { label: "Funds Deposited", tone: "funded", icon: "💰" },
  WorkSubmitted: { label: "Work Submitted", tone: "submitted", icon: "📝" },
  WorkApproved: { label: "Work Approved", tone: "approved", icon: "✅" },
  FundsReleased: { label: "Funds Released", tone: "completed", icon: "🚀" },
};

function shortenAddress(address) {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeEscrowId(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const digits = raw.match(/\d+/g)?.join("");
  if (digits) {
    return Number(digits);
  }

  return null;
}

function formatRelativeTime(timestampSeconds) {
  if (!timestampSeconds) return "just now";

  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(timestampSeconds));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatAmount(amount) {
  try {
    return `${Number(formatUnits(amount ?? 0n, 6)).toFixed(2)} USDC`;
  } catch {
    return "--";
  }
}

function getEscrowStatusMeta(escrow) {
  if (!escrow) return { label: "Waiting", className: "waiting" };
  if (escrow.released) return { label: "Completed", className: "completed" };
  if (escrow.approved) return { label: "Approved", className: "approved" };
  if (escrow.workSubmitted) return { label: "Work Submitted", className: "submitted" };
  if (escrow.funded) return { label: "Funded", className: "funded" };
  return { label: "Waiting", className: "waiting" };
}

function getWorkflowStep(escrow) {
  if (!escrow) return 0;
  if (escrow.released) return 6;
  if (escrow.approved) return 5;
  if (escrow.workSubmitted) return 4;
  if (escrow.funded) return 3;
  return 1;
}

function mapEscrowState(data, id) {
  const client = data?.client ?? data?.[0];
  const freelancer = data?.freelancer ?? data?.[1];
  const amount = data?.amount ?? data?.[2];
  const funded = data?.funded ?? data?.[3];
  const workSubmitted = data?.workSubmitted ?? data?.[4];
  const approved = data?.approved ?? data?.[5];
  const released = data?.released ?? data?.[6];

  return {
    id: String(id),
    client,
    freelancer,
    amount,
    funded: Boolean(funded),
    workSubmitted: Boolean(workSubmitted),
    approved: Boolean(approved),
    released: Boolean(released),
  };
}

function Dashboard(props) {
  const {
    activeSection = "dashboard",
    onNavigate,
    currentStep,
    setCurrentStep,
    escrowId,
    setEscrowId,
  } = props ?? {};

  const [internalStep, setInternalStep] = useState(0);
  const [internalEscrowId, setInternalEscrowId] = useState("");
  const [wallet, setWallet] = useState({
    connected: false,
    address: "--",
    balance: "--",
    network: "Arc Testnet",
    loading: false,
  });
  const [activityItems, setActivityItems] = useState([]);
  const [recentEscrows, setRecentEscrows] = useState([]);
  const [summaryEscrow, setSummaryEscrow] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [summaryError, setSummaryError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);

  const { address: connectedAddress, walletProvider } = useWalletBridge();
  const providerSource = useMemo(
    () => walletProvider ?? (typeof window !== "undefined" ? window.ethereum : null),
    [walletProvider],
  );

  const resolvedStep = Number.isFinite(currentStep) ? currentStep : internalStep;
  const resolvedEscrowId = useMemo(() => {
    const candidate =
      typeof escrowId === "string" && escrowId.trim().length > 0
        ? escrowId
        : internalEscrowId;

    return normalizeEscrowId(candidate);
  }, [escrowId, internalEscrowId]);

  const selectedSummaryId = useMemo(() => {
    return resolvedEscrowId ?? (recentEscrows[0]?.id ? Number(recentEscrows[0].id) : null);
  }, [resolvedEscrowId, recentEscrows]);

  const liveStep = useMemo(() => {
    const blockchainStep = getWorkflowStep(summaryEscrow);
    return Math.max(resolvedStep, blockchainStep);
  }, [resolvedStep, summaryEscrow]);

  const handleSetCurrentStep = (step) => {
    setInternalStep(step);
    if (typeof setCurrentStep === "function") {
      setCurrentStep(step);
    }
  };

  const handleSetEscrowId = (nextEscrowId) => {
    const value = nextEscrowId === null || nextEscrowId === undefined ? "" : String(nextEscrowId);
    setInternalEscrowId(value);
    if (typeof setEscrowId === "function") {
      setEscrowId(value);
    }
  };

  const triggerBlockchainRefresh = () => {
    setRefreshTick((tick) => tick + 1);
  };

  useEffect(() => {
    const target = document.getElementById(activeSection);
    if (target) {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [activeSection]);

  useEffect(() => {
    let cancelled = false;

    const refreshChainSnapshot = async () => {
      if (!providerSource) {
        setWallet({
          connected: false,
          address: "--",
          balance: "--",
          network: "Arc Testnet",
          loading: false,
        });
        setFeedLoading(false);
        return;
      }

      try {
        setFeedLoading(true);
        setWallet((prev) => ({ ...prev, loading: true }));

        const provider = new BrowserProvider(providerSource);
        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, provider);
        const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);

        const [accounts, network, latestBlock] = await Promise.all([
          provider.send("eth_accounts", []),
          provider.getNetwork(),
          provider.getBlockNumber(),
        ]);

        if (cancelled) return;

        const address = accounts?.[0] ?? connectedAddress ?? null;
        let balanceText = "--";
        if (address) {
          const balance = await usdc.balanceOf(address);
          if (cancelled) return;
          balanceText = `${Number(formatUnits(balance, 6)).toFixed(2)} USDC`;
        }

        setWallet({
          connected: Boolean(address),
          address: address ? shortenAddress(address) : "--",
          balance: balanceText,
          network: network?.name && network.name !== "unknown" ? network.name : "Arc Testnet",
          loading: false,
        });

        const fromBlock = Math.max(0, latestBlock - 5000);

        const [createdEvents, depositedEvents, submittedEvents, approvedEvents, releasedEvents] =
          await Promise.all([
            contract.queryFilter(contract.filters.EscrowCreated(), fromBlock, latestBlock),
            contract.queryFilter(contract.filters.FundsDeposited(), fromBlock, latestBlock),
            contract.queryFilter(contract.filters.WorkSubmitted(), fromBlock, latestBlock),
            contract.queryFilter(contract.filters.WorkApproved(), fromBlock, latestBlock),
            contract.queryFilter(contract.filters.FundsReleased(), fromBlock, latestBlock),
          ]);

        if (cancelled) return;

        const allEvents = [
          ...createdEvents.map((event) => ({ ...event, type: "EscrowCreated" })),
          ...depositedEvents.map((event) => ({ ...event, type: "FundsDeposited" })),
          ...submittedEvents.map((event) => ({ ...event, type: "WorkSubmitted" })),
          ...approvedEvents.map((event) => ({ ...event, type: "WorkApproved" })),
          ...releasedEvents.map((event) => ({ ...event, type: "FundsReleased" })),
        ];

        const blockCache = new Map();
        const formatBlockTime = async (blockNumber) => {
          if (blockCache.has(blockNumber)) return blockCache.get(blockNumber);
          const block = await provider.getBlock(blockNumber);
          const timestamp = block?.timestamp ?? 0;
          blockCache.set(blockNumber, timestamp);
          return timestamp;
        };

        const feed = await Promise.all(
          allEvents
            .sort((a, b) => {
              if (a.blockNumber !== b.blockNumber) return b.blockNumber - a.blockNumber;
              return (b.logIndex ?? 0) - (a.logIndex ?? 0);
            })
            .slice(0, 12)
            .map(async (event) => {
              const meta = ACTIVITY_META[event.type] ?? {
                label: event.type,
                tone: "waiting",
                icon: "•",
              };

              const timestamp = await formatBlockTime(event.blockNumber);
              const escrowIdFromEvent = event.args?.escrowId ?? event.args?.[0];
              const amountFromEvent = event.args?.amount ?? event.args?.[1];
              const clientFromEvent = event.args?.client ?? event.args?.[1];
              const freelancerFromEvent = event.args?.freelancer ?? event.args?.[2];

              let detail = `Block #${event.blockNumber}`;
              if (event.type === "EscrowCreated") {
                detail = `Client ${shortenAddress(clientFromEvent)} → Freelancer ${shortenAddress(
                  freelancerFromEvent,
                )} · ${formatAmount(amountFromEvent)}`;
              } else if (event.type === "FundsDeposited") {
                detail = `${formatAmount(amountFromEvent)} locked in escrow`;
              } else if (event.type === "FundsReleased") {
                detail = `${formatAmount(amountFromEvent)} sent to freelancer`;
              } else {
                detail = `Escrow #${escrowIdFromEvent?.toString?.() ?? escrowIdFromEvent}`;
              }

              return {
                key: `${event.transactionHash}-${event.logIndex}`,
                label: meta.label,
                tone: meta.tone,
                icon: meta.icon,
                escrowId: escrowIdFromEvent?.toString?.() ?? String(escrowIdFromEvent ?? "--"),
                txHash: event.transactionHash,
                blockNumber: event.blockNumber,
                timeAgo: formatRelativeTime(timestamp),
                detail,
              };
            }),
        );

        if (cancelled) return;
        setActivityItems(feed);

        const createdIds = Array.from(
          new Set(
            createdEvents
              .map((event) => event.args?.escrowId ?? event.args?.[0])
              .filter((value) => value !== undefined && value !== null)
              .map((value) => value.toString()),
          ),
        )
          .sort((a, b) => Number(b) - Number(a))
          .slice(0, 4);

        const escrows = await Promise.all(
          createdIds.map(async (id) => {
            const data = await contract.escrows(Number(id));
            const mapped = mapEscrowState(data, id);
            return {
              ...mapped,
              amountText: formatAmount(mapped.amount),
              clientText: shortenAddress(mapped.client),
              freelancerText: shortenAddress(mapped.freelancer),
              status: getEscrowStatusMeta(mapped),
            };
          }),
        );

        if (cancelled) return;
        setRecentEscrows(escrows);
      } catch (err) {
        console.error("Dashboard chain refresh error:", err);
        if (!cancelled) {
          setFeedLoading(false);
        }
      } finally {
        if (!cancelled) {
          setFeedLoading(false);
        }
      }
    };

    const handleBlock = () => {
      refreshChainSnapshot();
    };

    const handleAccountsChanged = () => {
      refreshChainSnapshot();
    };

    const handleChainChanged = () => {
      refreshChainSnapshot();
    };

    refreshChainSnapshot();

    if (providerSource && typeof providerSource.on === "function") {
      providerSource.on("accountsChanged", handleAccountsChanged);
      providerSource.on("chainChanged", handleChainChanged);

      const provider = new BrowserProvider(providerSource);
      provider.on("block", handleBlock);

      return () => {
        cancelled = true;
        provider.off("block", handleBlock);
        providerSource.removeListener?.("accountsChanged", handleAccountsChanged);
        providerSource.removeListener?.("chainChanged", handleChainChanged);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [refreshTick, providerSource, connectedAddress]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      if (!selectedSummaryId || !providerSource) {
        setSummaryEscrow(null);
        setSummaryError(selectedSummaryId ? "Wallet not available" : "");
        return;
      }

      try {
        setSummaryLoading(true);
        setSummaryError("");

        const provider = new BrowserProvider(providerSource);
        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, provider);
        const data = await contract.escrows(Number(selectedSummaryId));

        if (cancelled) return;

        const mapped = mapEscrowState(data, selectedSummaryId);
        setSummaryEscrow({
          ...mapped,
          amountText: formatAmount(mapped.amount),
          clientText: shortenAddress(mapped.client),
          freelancerText: shortenAddress(mapped.freelancer),
          status: getEscrowStatusMeta(mapped),
        });
      } catch (err) {
        if (!cancelled) {
          setSummaryEscrow(null);
          setSummaryError(
            err?.shortMessage || err?.reason || err?.message || "Failed to load escrow data",
          );
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [selectedSummaryId, providerSource]);

  const displayedSummary = summaryEscrow ?? recentEscrows[0] ?? null;
  const displayedStep = Math.min(Math.max(liveStep, 0), STEPS.length);

  return (
    <main className="dashboard">
      <section id="dashboard" className="dashboard-header">
        <div className="theme-badge">Arc Network • Live Escrow Dashboard</div>
        <h1>Secure USDC Escrow Platform</h1>
        <p className="dashboard-lead">
          Trustless payments for freelancers powered by Arc Network.
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          <section className="card progress-stepper" aria-label="Escrow progress">
            <div className="progress-stepper-header">
              <div>
                <h3>Escrow Progress</h3>
                <p>Secure • Transparent • Decentralized</p>
              </div>

              <span className="status-badge live">Live</span>
            </div>

            <div className="progress-track">
              {STEPS.map((step, index) => {
                let state = "pending";
                if (displayedStep >= STEPS.length) {
                  state = "completed";
                }
                if (index < displayedStep) {
                  state = "completed";
                } else if (index === displayedStep) {
                  state = "active";
                }

                return (
                  <div key={step} className={`progress-step ${state}`}>
                    <div className="progress-circle">{index + 1}</div>
                    <span className="progress-label">{step}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section id="create-escrow" className="dashboard-block">
            <CreateEscrow
              escrowId={
                typeof escrowId === "string" && escrowId.trim().length > 0
                  ? escrowId
                  : internalEscrowId
              }
              setEscrowId={handleSetEscrowId}
              setCurrentStep={handleSetCurrentStep}
              onBlockchainUpdate={triggerBlockchainRefresh}
            />
          </section>

          <section className="card activity-card">
            <div className="summary-header">
              <div>
                <h3>Recent Activity</h3>
                <p>Live blockchain events from the escrow contract</p>
              </div>
              <span className="status-badge live">Live</span>
            </div>

            {feedLoading && activityItems.length === 0 ? (
              <p className="section-copy">Loading live activity feed...</p>
            ) : activityItems.length ? (
              <div style={{ display: "grid", gap: "12px", marginTop: "6px" }}>
                {activityItems.map((item) => (
                  <article
                    key={item.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: "14px",
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: "18px",
                      background: "rgba(255,255,255,0.74)",
                      border: "1px solid rgba(148,163,184,0.14)",
                      boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "14px",
                        display: "grid",
                        placeItems: "center",
                        background:
                          item.tone === "completed"
                            ? "rgba(34,197,94,0.14)"
                            : item.tone === "funded"
                              ? "rgba(59,130,246,0.14)"
                              : item.tone === "submitted"
                                ? "rgba(249,115,22,0.14)"
                                : item.tone === "approved"
                                  ? "rgba(139,92,246,0.14)"
                                  : "rgba(37,99,235,0.14)",
                        color:
                          item.tone === "completed"
                            ? "#16a34a"
                            : item.tone === "funded"
                              ? "#2563eb"
                              : item.tone === "submitted"
                                ? "#ea580c"
                                : item.tone === "approved"
                                  ? "#7c3aed"
                                  : "#1d4ed8",
                        fontSize: "18px",
                        fontWeight: 800,
                      }}
                    >
                      {item.icon}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ color: "#0f172a", fontSize: "14px" }}>
                          {item.label}
                        </strong>
                        <span
                          className={`status-badge ${item.tone}`}
                          style={{ padding: "6px 10px" }}
                        >
                          Escrow #{item.escrowId}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: "4px 0 0",
                          color: "#64748b",
                          fontSize: "13px",
                          lineHeight: 1.6,
                          wordBreak: "break-word",
                        }}
                      >
                        {item.detail}
                      </p>
                    </div>

                    <div style={{ textAlign: "right", minWidth: "120px" }}>
                      <div style={{ color: "#0f172a", fontSize: "12px", fontWeight: 700 }}>
                        {item.timeAgo}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>
                        {shortenAddress(item.txHash)}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-empty">
                <strong>No recent activity yet</strong>
                <p>
                  Create, fund, submit, approve, and release an escrow to populate this
                  section from blockchain events.
                </p>
              </div>
            )}
          </section>

          <section id="my-escrows" className="card dashboard-section">
            <div className="summary-header">
              <div>
                <h3>📦 My Escrows</h3>
                <p>Live escrow records pulled from the contract</p>
              </div>
              <span className="status-badge live">Live</span>
            </div>

            {recentEscrows.length ? (
              <div style={{ display: "grid", gap: "12px", marginTop: "6px" }}>
                {recentEscrows.map((escrow) => (
                  <article
                    key={escrow.id}
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      background: "rgba(255,255,255,0.74)",
                      border: "1px solid rgba(148,163,184,0.14)",
                      boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "12px",
                        marginBottom: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <strong style={{ color: "#0f172a", fontSize: "15px" }}>
                          Escrow #{escrow.id}
                        </strong>
                        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
                          {escrow.amountText}
                        </p>
                      </div>
                      <span className={`status-badge ${escrow.status.className}`}>
                        {escrow.status.label}
                      </span>
                    </div>

                    <div className="summary-item">
                      <span>Client</span>
                      <strong>{escrow.clientText}</strong>
                    </div>
                    <div className="summary-item">
                      <span>Freelancer</span>
                      <strong>{escrow.freelancerText}</strong>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="section-copy">
                No escrows found yet. Create one to see live records here.
              </p>
            )}
          </section>

          <section id="transactions" className="card dashboard-section">
            <div className="summary-header">
              <div>
                <h3>💸 Transactions</h3>
                <p>Latest on-chain activity and transaction hashes</p>
              </div>
              <span className="status-badge live">Live</span>
            </div>

            {activityItems.length ? (
              <div style={{ display: "grid", gap: "12px", marginTop: "6px" }}>
                {activityItems.slice(0, 6).map((item) => (
                  <div
                    key={`tx-${item.key}`}
                    className="summary-item"
                    style={{
                      padding: "14px 16px",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.68)",
                      border: "1px solid rgba(148,163,184,0.12)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ display: "block", marginBottom: "4px" }}>
                        {item.label}
                      </span>
                      <strong style={{ fontSize: "13px" }}>{shortenAddress(item.txHash)}</strong>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ display: "block", marginBottom: "4px" }}>
                        Block #{item.blockNumber}
                      </span>
                      <strong style={{ fontSize: "12px", color: "#64748b" }}>
                        {item.timeAgo}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-copy">
                Transaction history will appear here once escrow events hit the chain.
              </p>
            )}
          </section>

          <section id="settings" className="card dashboard-section">
            <div className="summary-header">
              <div>
                <h3>⚙️ Settings</h3>
                <p>Wallet and UI preferences</p>
              </div>
            </div>

            <p className="section-copy">
              Theme controls, network hints, and other preferences can live here later.
            </p>
          </section>

          <section id="help-center" className="card dashboard-section">
            <div className="summary-header">
              <div>
                <h3>❓ Help Center</h3>
                <p>Open help while keeping the escrow flow untouched</p>
              </div>
              <span className="status-badge live">Live</span>
            </div>

            <div style={{ display: "grid", gap: "14px", marginTop: "6px" }}>
              <div className="help-section" style={{ padding: "16px" }}>
                <h4 style={{ marginTop: 0 }}>Need Help?</h4>
                <p className="section-copy">
                  Use the sidebar to jump around the dashboard, or use the escrow buttons
                  to continue the blockchain flow without any lifecycle changes.
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                  <button
                    type="button"
                    className="help-cta"
                    onClick={() => onNavigate?.("dashboard")}
                  >
                    Back to Dashboard
                  </button>
                  <button
                    type="button"
                    className="help-cta"
                    onClick={() => onNavigate?.("create-escrow")}
                  >
                    Go to Create Escrow
                  </button>
                </div>
              </div>

              <div className="help-section" style={{ padding: "16px" }}>
                <h4 style={{ marginTop: 0 }}>Quick Tips</h4>
                <ul style={{ margin: 0, paddingLeft: "18px", lineHeight: 1.8, color: "#64748b" }}>
                  <li>Approve USDC before trying to deposit funds.</li>
                  <li>Use the correct escrow ID before calling submit or release.</li>
                  <li>The summary, wallet, and activity feed are read directly from chain data.</li>
                </ul>
              </div>
            </div>
          </section>
        </section>

        <aside className="dashboard-side">
          <section className="card wallet-card">
            <div className="wallet-header">
              <div>
                <h3>💼 Wallet Overview</h3>
                <p>Your connected wallet status</p>
              </div>

              <span className={`wallet-badge ${wallet.connected ? "connected" : "disconnected"}`}>
                <span className="status-dot" />
                {wallet.connected ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="wallet-info">
              <div className="wallet-item">
                <span>Network</span>
                <strong>{wallet.network}</strong>
              </div>

              <div className="wallet-item">
                <span>USDC Balance</span>
                <strong>{wallet.loading ? "Loading..." : wallet.balance}</strong>
              </div>

              <div className="wallet-item">
                <span>Wallet Status</span>
                <strong>{wallet.connected ? "Active" : "Inactive"}</strong>
              </div>

              <div className="wallet-item">
                <span>Address</span>
                <strong>{wallet.address}</strong>
              </div>
            </div>
          </section>

          <section className="card quick-help-card">
            <div className="summary-header">
              <div>
                <h3>Need Help?</h3>
                <p>Jump directly to the help section</p>
              </div>
            </div>

            <p className="quick-help-text">
              Open the help center for escrow steps, tips, and troubleshooting.
            </p>

            <button
              type="button"
              className="help-cta"
              onClick={() => onNavigate?.("help-center")}
            >
              Open Help Center
            </button>
          </section>

          <section className="card escrow-summary">
            <div className="summary-header">
              <div>
                <h3>📋 Escrow Summary</h3>
                <p>Current live escrow from blockchain</p>
              </div>

              <span className={`status-badge ${displayedSummary?.status?.className || "waiting"}`}>
                {displayedSummary?.status?.label || "Waiting"}
              </span>
            </div>

            <p className="summary-subtitle">
              {summaryLoading
                ? "Loading live escrow details..."
                : summaryError
                  ? summaryError
                  : displayedSummary
                    ? "Current escrow details are loaded directly from the contract."
                    : "Select or create an escrow to see live details here."}
            </p>

            <div className="summary-item">
              <span>Escrow ID</span>
              <strong>{displayedSummary?.id ?? "--"}</strong>
            </div>

            <div className="summary-item">
              <span>Client</span>
              <strong>{displayedSummary?.clientText ?? "--"}</strong>
            </div>

            <div className="summary-item">
              <span>Freelancer</span>
              <strong>{displayedSummary?.freelancerText ?? "--"}</strong>
            </div>

            <div className="summary-item">
              <span>Amount</span>
              <strong>{displayedSummary?.amountText ?? "--"}</strong>
            </div>

            <div className="summary-item">
              <span>Status</span>
              <strong className={`status-pill ${displayedSummary?.status?.className || "waiting"}`}>
                {displayedSummary?.status?.label || "Waiting"}
              </strong>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default Dashboard;
