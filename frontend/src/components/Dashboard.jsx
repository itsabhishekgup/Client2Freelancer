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
  getWorkflowTerminalLabel,
  getWorkflowTerminalMeta,
  mapEscrowState,
  normalizeEscrowId,
  shortenAddress,
} from "../lib/escrowFormat";
import ActivityFeed from "./ActivityFeed";
import CreateEscrow from "./CreateEscrow";
import FundFromAnyChain from "./FundFromAnyChain";
import SafetySummaryCard from "./SafetySummaryCard";
import EscrowDetailModal from "./EscrowDetailModal";
import EscrowsList from "./EscrowsList";
import EscrowSummaryPanel from "./EscrowSummaryPanel";
import WalletPanel from "./WalletPanel";
import { loadActivityHistory, mapFeedEvent, saveActivityHistory } from "../lib/liveApi";

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
    refreshMs,
    defaultExpiryDays,
    showActivityFeed,
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
  // Hydrate the activity/transaction feed from localStorage first so the user's
  // previous history is visible instantly, before the live poll/SSE re-syncs.
  const [activityItems, setActivityItems] = useState(() =>
    loadActivityHistory().map((ev, i) => mapFeedEvent(ev, i)),
  );
  const [recentEscrows, setRecentEscrows] = useState([]);
  const [summaryEscrow, setSummaryEscrow] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [summaryError, setSummaryError] = useState("");
  const [feedLoading, setFeedLoading] = useState(false);
  const [txVisibleCount, setTxVisibleCount] = useState(3);
  const [selectedEscrow, setSelectedEscrow] = useState(null);
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      (document.documentElement.classList.contains("is-mobile-device") ||
        window.innerWidth <= 768),
  );

  useEffect(() => {
    const handleResize = () =>
      setIsMobile(
        document.documentElement.classList.contains("is-mobile-device") ||
          window.innerWidth <= 768,
      );
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Mobile page model: each bottom-nav item maps to its own page so the
  // dashboard shows only Home content (progress + create + fund) and every
  // other section renders on its dedicated page. Desktop renders everything
  // on one scroll (unchanged).
  const mobilePage = isMobile
    ? activeSection === "my-escrows" ||
      activeSection === "transactions" ||
      activeSection === "activity" ||
      activeSection === "wallet"
      ? activeSection
      : "home"
    : null;

  const showMobileSection = (section) => {
    if (!isMobile) return true;
    if (mobilePage === "home") return section === "home";
    return section === mobilePage;
  };

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
    // The stepper must reflect the selected escrow's on-chain state, not the
    // global optimistic step — that value leaks from a previously-viewed
    // escrow (e.g. after releasing escrow A, escrow B's stepper showed
    // "Approve Work" done). Prefer the fresh recentEscrows snapshot (refreshed
    // on every poll) over summaryEscrow (loaded once per selected id), and
    // only use the optimistic step while on-chain data is still loading.
    const fresh =
      recentEscrows.find((e) => Number(e.id) === Number(selectedSummaryId)) ??
      summaryEscrow;
    const blockchainStep = getWorkflowStep(fresh);
    return fresh ? blockchainStep : Math.max(resolvedStep, blockchainStep);
  }, [recentEscrows, selectedSummaryId, summaryEscrow, resolvedStep]);

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
    // Mobile: each nav tab is a full page — jump straight to the top on
    // switch. Desktop: scroll to the matching dashboard section (unchanged).
    if (isMobile) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    const target = document.getElementById(activeSection);
    if (target) {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [activeSection, isMobile]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const refreshChainSnapshot = async () => {
      // Re-entrancy guard: if a previous refresh is still awaiting slow RPC
      // calls, skip this run. Otherwise slow fetches pile up and every poll
      // cycle spawns another overlapping batch, which saturates the RPC and
      // eventually freezes the tab.
      if (inFlight) return;
      inFlight = true;
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

        const eventNames = [
          "EscrowCreated",
          "FundsDeposited",
          "WorkSubmitted",
          "WorkApproved",
          "FundsReleased",
          "EscrowCancelled",
          "DisputeRaised",
          "DisputeResolved",
          "TokensRescued",
        ];

        // Feed source: prefer the backend /live cache (one HTTP call, no RPC
        // getLogs hammering — the fast testnet RPC rate-limits bursts). Fall
        // back to chunked direct getLogs only when the backend is unreachable.
        let feed = null;
        let rawFeedEvents = [];

        try {
          const api = await import("../lib/liveApi");
          const snap = await api.fetchLiveSnapshot({ signal: null });
          if (snap && Array.isArray(snap.events) && snap.events.length > 0) {
            rawFeedEvents = snap.events;
            feed = snap.events.slice(0, 12).map((ev, i) => api.mapFeedEvent(ev, i));
          }
        } catch (err) {
          console.warn("backend /live unavailable, falling back to direct RPC feed:", err);
        }

        if (!feed) {
          // Chunked getLogs fallback. The testnet RPC caps a single get_logs
          // range at ~10k blocks and the contract's earliest events are far
          // back, so scan a wide window in sequential chunks (never parallel —
          // bursts get rate-limited).
          const FEED_LOOKBACK_BLOCKS = 60_000;
          const GET_LOGS_CHUNK = 10_000;
          const fromBlock = Math.max(0, latestBlock - FEED_LOOKBACK_BLOCKS);
          let allEvents = [];

          try {
            const eventTopics = eventNames.map((name) =>
              contract.interface.getEvent(name).topicHash,
            );
            const rawLogs = [];
            for (let start = fromBlock; start <= latestBlock; start += GET_LOGS_CHUNK) {
              if (cancelled) return;
              const end = Math.min(latestBlock, start + GET_LOGS_CHUNK - 1);
              const chunkLogs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                fromBlock: start,
                toBlock: end,
                topics: [eventTopics],
              });
              rawLogs.push(...chunkLogs);
            }

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

          feed = await Promise.all(
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
                // Positional arg layout per event (ethers v6 Result throws on
                // out-of-range access, hence getArg):
                //   EscrowCreated(id, client, freelancer, amount)
                //   FundsDeposited/Released/Cancelled(id, amount)
                //   DisputeResolved(id, favorFreelancer, amount)
                //   WorkSubmitted/Approved/DisputeRaised(id)
                const clientFromEvent =
                  event.type === "EscrowCreated"
                    ? event.args?.client ?? getArg(event.args, 1)
                    : undefined;
                const freelancerFromEvent =
                  event.type === "EscrowCreated"
                    ? event.args?.freelancer ?? getArg(event.args, 2)
                    : undefined;
                const amountFromEvent =
                  event.type === "EscrowCreated"
                    ? event.args?.amount ?? getArg(event.args, 3)
                    : event.type === "DisputeResolved"
                      ? event.args?.amount ?? getArg(event.args, 2)
                      : event.args?.amount ?? getArg(event.args, 1);

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
        }

        if (cancelled) return;
        if (rawFeedEvents.length) {
          saveActivityHistory(rawFeedEvents);
        }
        setActivityItems((prev) => {
          if (!feed) return prev;
          const seen = new Set(prev.map((p) => `${p.txHash}-${p.blockNumber}`));
          const merged = prev.slice();
          for (const item of feed) {
            const key = `${item.txHash}-${item.blockNumber}`;
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(item);
          }
          merged.sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
          return merged.slice(0, 200);
        });

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
        inFlight = false;
        if (!cancelled) {
          setFeedLoading(false);
        }
      }
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

      // NOTE: no `provider.on("block", ...)` here on purpose. Arc testnet mines
      // ~1000 blocks/min, so a block listener would fire refreshChainSnapshot
      // ~every 60ms — each run makes multiple RPC calls, and the public testnet
      // RPC rate-limits bursts (HTTP 429). That flood of overlapping fetches is
      // what makes the page freeze ("Page Unresponsive"). The setInterval below
      // (Settings → Auto-refresh, default 30s) is the single refresh driver.

      return () => {
        cancelled = true;
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

  // Auto-refresh: re-run the chain snapshot on the interval chosen in Settings.
  // Skip when the tab is hidden — background tabs keep polling the backend+RPC
  // every 30s for no user benefit, which wastes requests on the rate-limited
  // testnet RPC. A visibilitychange listener refreshes immediately on return.
  useEffect(() => {
    if (!refreshMs) return undefined;

    const tick = () => {
      if (document.visibilityState === "visible") {
        setRefreshTick((t) => t + 1);
      }
    };
    const id = setInterval(tick, refreshMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setRefreshTick((t) => t + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshMs]);

  // Near-real-time feed: subscribe to the backend's Server-Sent Events stream
  // and prepend each freshly-indexed event into the activity feed. The 30s poll
  // above remains as a safety net (and to refresh escrows/wallet/balance), so
  // a dropped SSE connection never leaves the UI stale.
  useEffect(() => {
    let cleanup = () => {};

    (async () => {
      try {
        const api = await import("../lib/liveApi");
        cleanup = api.subscribeToEvents(
          (ev) => {
            const item = api.mapFeedEvent(ev);
            saveActivityHistory([ev]);
            setActivityItems((prev) => {
              // De-duplicate by tx hash + block so a poll arriving after an SSE
              // push never creates a duplicate row.
              const exists = prev.some(
                (p) => p.txHash === item.txHash && p.blockNumber === item.blockNumber,
              );
              if (exists) return prev;
              return [item, ...prev].slice(0, 200);
            });
          },
          (err) => {
            console.warn("live events stream disconnected; polling continues:", err);
          },
        );
      } catch (err) {
        console.warn("could not open live events stream:", err);
      }
    })();

    return () => {
      cleanup();
    };
  }, []);

  const displayedSummary = summaryEscrow ?? recentEscrows[0] ?? null;
  const terminalLabel = getWorkflowTerminalLabel(displayedSummary);
  const terminalMeta = getWorkflowTerminalMeta(displayedSummary);
  // No escrow ID entered yet → keep the stepper at zero instead of showing
  // the most recent escrow's progress. Once an ID is entered (or created),
  // the stepper reflects that escrow's on-chain progress.
  const noEscrowSelected = !resolvedEscrowId;
  const isTerminal = noEscrowSelected ? false : Boolean(terminalLabel);
  const displayedStep = noEscrowSelected || isTerminal
    ? 0
    : Math.min(Math.max(liveStep, 0), STEPS.length);

  // Timeline for the open modal: activity feed events for that escrow.
  const selectedEscrowEvents = useMemo(() => {
    if (!selectedEscrow) return [];
    return activityItems.filter(
      (item) => String(item.escrowId) === String(selectedEscrow.id),
    );
  }, [selectedEscrow, activityItems]);

  return (
    <main className="dashboard">
      <section id="dashboard" className="dashboard-header">
        {isMobile && mobilePage !== "home" ? (
          <>
            <div className="theme-badge">
              {mobilePage === "wallet"
                ? "Wallet"
                : mobilePage === "my-escrows"
                  ? "My Escrows"
                  : mobilePage === "activity"
                    ? "Recent Activity"
                    : "Transactions"}
            </div>
            <h1>
              {mobilePage === "wallet"
                ? "Wallet Overview"
                : mobilePage === "my-escrows"
                  ? "My Escrows"
                  : mobilePage === "activity"
                    ? "Recent Activity"
                    : "Transactions"}
            </h1>
            <p className="dashboard-lead">
              {mobilePage === "wallet"
                ? "Your connected wallet status and balance."
                : mobilePage === "my-escrows"
                  ? "Live escrow records pulled from the contract."
                  : mobilePage === "activity"
                    ? "Live blockchain events from the escrow contract."
                    : "Latest on-chain activity and transaction hashes."}
            </p>
          </>
        ) : (
          <>
            <div className="theme-badge">Arc Network • Live Escrow Dashboard</div>
            <h1>Secure USDC Escrow Platform</h1>
            <p className="dashboard-lead">
              Trustless payments for freelancers powered by Arc Network.
            </p>
          </>
        )}
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          {showMobileSection("home") && (
            <section className="card progress-stepper" aria-label="Escrow progress">
            <div className="progress-stepper-header">
              <div>
                <h3>Escrow Progress</h3>
                <p>Secure • Transparent • Decentralized</p>
              </div>

              <span className="status-badge live">Live</span>
            </div>

            <div className="progress-track">
              {isTerminal ? (
                <div className={`progress-terminal-card progress-terminal-card--${terminalMeta.tone}`}>
                  <div className="progress-terminal-icon" aria-hidden="true">
                    {terminalMeta.icon === "check" ? (
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    ) : terminalMeta.icon === "cancel" ? (
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="m15 9-6 6" />
                        <path d="m9 9 6 6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                    )}
                  </div>
                  <div className="progress-terminal-body">
                    <strong>{terminalMeta.title}</strong>
                    <span>{terminalMeta.subtitle}</span>
                  </div>
                  <span className={`progress-terminal-chip progress-terminal-chip--${terminalMeta.tone}`}>
                    {terminalMeta.icon === "check" ? "✓" : terminalMeta.icon === "cancel" ? "↩" : "⚠"}
                    {terminalMeta.tone === "green"
                      ? " Released"
                      : terminalMeta.tone === "amber"
                        ? " Refunded"
                        : " Open"}
                  </span>
                </div>
              ) : (
                STEPS.map((step, index) => {
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
                })
              )}
            </div>
          </section>
          )}

          {showMobileSection("home") && (
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
                defaultExpiryDays={defaultExpiryDays}
              />
            </section>
          )}

          {showMobileSection("home") && (
            <section className="dashboard-block">
              <FundFromAnyChain
                escrowId={resolvedEscrowId ?? ""}
                onBlockchainUpdate={triggerBlockchainRefresh}
              />
            </section>
          )}

          {showMobileSection("activity") && showActivityFeed && (
            <ActivityFeed activityItems={activityItems} feedLoading={feedLoading} />
          )}

          {showMobileSection("my-escrows") && (
            <EscrowsList escrows={recentEscrows} onSelectEscrow={setSelectedEscrow} />
          )}

          {showMobileSection("transactions") && (
            <section id="transactions" className="card dashboard-section">
            <div className="summary-header">
              <div>
                <h3>💸 Transactions</h3>
                <p>Latest on-chain activity and transaction hashes</p>
              </div>
              <span className="status-badge live">Live</span>
            </div>

            {activityItems.length ? (
              <div className="tx-list" style={{ display: "grid", gap: "8px", marginTop: "8px" }}>
                {activityItems.slice(0, txVisibleCount).map((item) => (
                  <div
                    key={`tx-${item.key}`}
                    className="summary-item tx-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "9px 12px",
                      borderRadius: "10px",
                      background: "var(--tx-item-bg, rgba(15,20,40,0.5))",
                      border: "1px solid var(--tx-item-border, #1e2126)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        flex: "none",
                        width: "28px",
                        height: "28px",
                        borderRadius: "8px",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "13px",
                        background: "rgba(94,106,210,0.12)",
                        border: "1px solid rgba(94,106,210,0.22)",
                      }}
                    >
                      {item.icon || "•"}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: "13px", lineHeight: 1.35 }}>
                        {item.label}
                      </span>
                      <strong style={{ fontSize: "11.5px", color: "#7c838e", fontWeight: 500 }}>
                        {shortenAddress(item.txHash)}
                      </strong>
                    </div>
                    <div style={{ textAlign: "right", flex: "none" }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: "11px",
                          color: "#7c838e",
                          lineHeight: 1.35,
                        }}
                      >
                        Block #{item.blockNumber}
                      </span>
                      <strong style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
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

            {activityItems.length > txVisibleCount && (
              <div style={{ textAlign: "center", marginTop: "14px" }}>
                <button
                  type="button"
                  className="premium-action-btn premium-action-btn--load-more"
                  onClick={() => setTxVisibleCount((count) => count + 3)}
                >
                  Show more ({activityItems.length - txVisibleCount} remaining)
                </button>
              </div>
            )}
          </section>
          )}

        </section>

        {showMobileSection("wallet") && (
        <aside className="dashboard-side">
          <WalletPanel wallet={wallet} />

          <SafetySummaryCard onNavigate={onNavigate} />

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
        )}
      </div>

      <EscrowDetailModal
        escrow={selectedEscrow}
        events={selectedEscrowEvents}
        onClose={() => setSelectedEscrow(null)}
      />
    </main>
  );
}

export default Dashboard;
