import { useEffect, useMemo, useState } from "react";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { USDC_ABI } from "../contracts/USDCABI";
import { USDC_ADDRESS } from "../contracts/constants";
import {
  ACTIVITY_META,
  STEPS,
  formatAmount,
  formatRelativeTime,
  getEscrowStatusMeta,
  getWorkflowStep,
  mapEscrowState,
  normalizeEscrowId,
  shortenAddress,
} from "../lib/escrowFormat";
import ActivityFeed from "./ActivityFeed";
import CreateEscrow from "./CreateEscrow";
import EscrowsList from "./EscrowsList";
import EscrowSummaryPanel from "./EscrowSummaryPanel";
import WalletPanel from "./WalletPanel";

// Read-only chain data (activity feed, recent escrows, escrow summary) loads
// via a public RPC even when no wallet is connected.
const PUBLIC_RPC_URL = arcTestnet.rpcUrls.default.http[0];

function resolveReadProvider(providerSource) {
  return providerSource
    ? new BrowserProvider(providerSource)
    : new JsonRpcProvider(PUBLIC_RPC_URL);
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
      const provider = resolveReadProvider(providerSource);

      if (!providerSource) {
        setWallet({
          connected: false,
          address: "--",
          balance: "--",
          network: "Arc Testnet",
          loading: false,
        });
      }

      try {
        setFeedLoading(true);
        if (providerSource) {
          setWallet((prev) => ({ ...prev, loading: true }));
        }

        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, provider);
        const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);

        let accounts = [];
        if (providerSource) {
          accounts = await provider.send("eth_accounts", []);
        }
        const [network, latestBlock] = await Promise.all([
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

        // Single eth_getLogs call with OR'd event topics instead of 8 parallel
        // queries — the public testnet RPC rate-limits bursts of get_logs.
        const eventNames = [
          "EscrowCreated",
          "FundsDeposited",
          "WorkSubmitted",
          "WorkApproved",
          "FundsReleased",
          "EscrowCancelled",
          "DisputeRaised",
          "DisputeResolved",
        ];
        let allEvents = [];
        // Feed is best-effort: the fast testnet RPC rate-limits getLogs, and a
        // feed failure should not block the escrow list (which loads from the
        // backend /escrows endpoint or a direct escrowCount read).
        try {
          const eventTopics = eventNames.map((name) =>
            contract.interface.getEvent(name).topicHash,
          );
          const rawLogs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock,
            toBlock: latestBlock,
            topics: [eventTopics],
          });

          if (cancelled) return;

          const parsedLogs = rawLogs
            .map((log) => {
              try {
                return { ...log, parsed: contract.interface.parseLog(log) };
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          allEvents = parsedLogs.map((entry) => ({
            ...entry,
            type: entry.parsed.name,
            args: entry.parsed.args,
          }));
        } catch (err) {
          console.warn("feed getLogs failed (escrows will still update):", err);
        }

        // ethers v6 Result throws RangeError on out-of-range array access,
        // so use a safe positional getter for event args.
        const getArg = (args, index) => {
          if (!args) return undefined;
          try {
            return args[index];
          } catch {
            return undefined;
          }
        };

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
              const escrowIdFromEvent = event.args?.escrowId ?? getArg(event.args, 0);
              const amountFromEvent = event.args?.amount ?? getArg(event.args, 1);
              const clientFromEvent = event.args?.client ?? getArg(event.args, 1);
              const freelancerFromEvent = event.args?.freelancer ?? getArg(event.args, 2);

              let detail = `Block #${event.blockNumber}`;
              if (event.type === "EscrowCreated") {
                detail = `Client ${shortenAddress(clientFromEvent)} → Freelancer ${shortenAddress(
                  freelancerFromEvent,
                )} · ${formatAmount(amountFromEvent)}`;
              } else if (event.type === "FundsDeposited") {
                detail = `${formatAmount(amountFromEvent)} locked in escrow`;
              } else if (event.type === "FundsReleased") {
                detail = `${formatAmount(amountFromEvent)} sent to freelancer`;
              } else if (event.type === "EscrowCancelled") {
                detail = `${formatAmount(amountFromEvent)} refunded to client`;
              } else if (event.type === "DisputeRaised") {
                detail = `Dispute opened — awaiting arbitration`;
              } else if (event.type === "DisputeResolved") {
                detail = `Resolved in favor of ${event.args?.favorFreelancer ? "freelancer" : "client"} · ${formatAmount(
                  amountFromEvent,
                )}`;
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

        // List ALL escrows — prefer the backend /escrows endpoint (escrowCount-
        // based, cached server-side). If the backend is down or the response is
        // incomplete, fall back to reading escrowCount directly and fetching
        // each escrow 4 at a time to stay under the RPC burst limit.
        let escrows = [];
        let escrowsLoaded = false;

        try {
          const api = await import("../lib/liveApi");
          const list = await api.fetchEscrows({ limit: 500, signal: null });
          if (list && Array.isArray(list.escrows) && list.escrows.length > 0) {
            escrows = list.escrows.map((item) => {
              const mapped = {
                id: String(item.id),
                client: item.client,
                freelancer: item.freelancer,
                amount: item.amount_wei ?? "0",
                funded: Boolean(item.funded),
                workSubmitted: Boolean(item.workSubmitted),
                approved: Boolean(item.approved),
                released: Boolean(item.released),
                refunded: Boolean(item.refunded),
                disputed: Boolean(item.disputed),
                createdAt: item.createdAt,
                expiresAt: item.expiresAt,
              };
              return {
                ...mapped,
                amountText: item.amount ?? formatAmount(mapped.amount),
                clientText: item.client_short ?? shortenAddress(item.client),
                freelancerText: item.freelancer_short ?? shortenAddress(item.freelancer),
                status: getEscrowStatusMeta(mapped),
              };
            });
            escrowsLoaded = true;
            if (list.complete === false) {
              console.warn("backend /escrows returned a partial list; using it anyway");
            }
          }
        } catch (err) {
          console.warn("backend /escrows unavailable, falling back to direct RPC:", err);
        }

        if (!escrowsLoaded) {
          let escrowCount = 0;
          try {
            escrowCount = Number(await contract.escrowCount());
          } catch (err) {
            console.error("escrowCount read error:", err);
          }

          const ids = Array.from({ length: escrowCount }, (_, i) => escrowCount - i);
          escrows = [];

          for (let i = 0; i < ids.length; i += 4) {
            if (cancelled) return;
            const chunk = ids.slice(i, i + 4);
            const chunkResults = await Promise.all(
              chunk.map(async (id) => {
                try {
                  const data = await contract.escrows(id);
                  const mapped = mapEscrowState(data, id);
                  return {
                    ...mapped,
                    amountText: formatAmount(mapped.amount),
                    clientText: shortenAddress(mapped.client),
                    freelancerText: shortenAddress(mapped.freelancer),
                    status: getEscrowStatusMeta(mapped),
                  };
                } catch (err) {
                  console.error(`escrow ${id} read error:`, err);
                  return null;
                }
              }),
            );
            escrows.push(...chunkResults.filter(Boolean));
          }
        }

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
      if (!selectedSummaryId) {
        setSummaryEscrow(null);
        setSummaryError("");
        return;
      }

      try {
        setSummaryLoading(true);
        setSummaryError("");

        const provider = resolveReadProvider(providerSource);
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

          <ActivityFeed activityItems={activityItems} feedLoading={feedLoading} />

          <EscrowsList escrows={recentEscrows} />

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
          <WalletPanel wallet={wallet} />

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

          <EscrowSummaryPanel
            escrow={displayedSummary}
            loading={summaryLoading}
            error={summaryError}
          />
        </aside>
      </div>
    </main>
  );
}

export default Dashboard;
