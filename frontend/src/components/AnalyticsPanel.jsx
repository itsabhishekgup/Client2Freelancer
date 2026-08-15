import { useEffect, useMemo, useState } from "react";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import {
  formatAmount,
  getEscrowStatusMeta,
  mapEscrowState,
  shortenAddress,
} from "../lib/escrowFormat";

// Read-only chain data loads via a public RPC even when no wallet is connected.
const PUBLIC_RPC_URL = arcTestnet.rpcUrls.default.http[0];

const STATUS_COLORS = {
  Waiting: "#6b7280",
  Funded: "#2563eb",
  "Work Submitted": "#ea580c",
  Approved: "#7c3aed",
  Completed: "#16a34a",
  Disputed: "#dc2626",
  Refunded: "#ca8a04",
};

const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "All" },
];

function StatCard({ label, value, sub, accent }) {
  return (
    <div className="analytics-stat">
      <span className="analytics-stat-label">{label}</span>
      <strong className="analytics-stat-value" style={accent ? { color: accent } : undefined}>
        {value}
      </strong>
      {sub ? <span className="analytics-stat-sub">{sub}</span> : null}
    </div>
  );
}

function toUsdc(value) {
  try {
    return Number(formatUnits(value ?? 0n, 6));
  } catch {
    return 0;
  }
}

function AnalyticsPanel({ escrows: propEscrows }) {
  const [escrows, setEscrows] = useState(propEscrows ?? []);
  const [loading, setLoading] = useState(!propEscrows);
  const [range, setRange] = useState("7d");

  // When rendered as a standalone page (no escrows passed down), load the
  // full escrow list itself: backend /escrows first, then a direct RPC read.
  useEffect(() => {
    if (propEscrows) {
      setEscrows(propEscrows);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const provider = new JsonRpcProvider(PUBLIC_RPC_URL);
        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, provider);

        let list = null;
        try {
          const api = await import("../lib/liveApi");
          const result = await api.fetchEscrows({ limit: 500, signal: null });
          if (result && Array.isArray(result.escrows) && result.escrows.length > 0) {
            list = result.escrows;
          }
        } catch (err) {
          console.warn("Analytics: backend /escrows unavailable, falling back to RPC:", err);
        }

        if (cancelled) return;

        if (list) {
          setEscrows(
            list.map((item) => {
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
            }),
          );
          return;
        }

        // Direct RPC fallback — escrowCount then chunked reads (4 at a time to
        // stay under the testnet RPC burst limit).
        let escrowCount = 0;
        try {
          escrowCount = Number(await contract.escrowCount());
        } catch (err) {
          console.error("Analytics: escrowCount read error:", err);
        }

        const ids = Array.from({ length: escrowCount }, (_, i) => escrowCount - i);
        const loaded = [];

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
                console.error(`Analytics: escrow ${id} read error:`, err);
                return null;
              }
            }),
          );
          loaded.push(...chunkResults.filter(Boolean));
        }

        if (!cancelled) setEscrows(loaded);
      } catch (err) {
        console.error("Analytics load error:", err);
        if (!cancelled) setEscrows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [propEscrows]);

  const stats = useMemo(() => {
    const now = Date.now();
    const rangeMs =
      range === "7d" ? 7 * 86_400_000 : range === "30d" ? 30 * 86_400_000 : null;

    // Escrows inside the selected window. Escrows without a createdAt are
    // always included so data never silently disappears.
    const filtered = rangeMs
      ? escrows.filter((e) => {
          const ms = e.createdAt ? Number(e.createdAt) * 1000 : null;
          return ms === null || ms >= now - rangeMs;
        })
      : escrows;

    let locked = 0;
    let released = 0;
    let active = 0;
    let disputed = 0;
    let completed = 0;
    let refunded = 0;
    let totalAmount = 0;

    const statusCount = {};
    const clientVol = new Map();
    const freelancerVol = new Map();

    for (const escrow of filtered) {
      const usdc = toUsdc(escrow.amount);
      totalAmount += usdc;

      const label = escrow.status?.label ?? "Waiting";
      statusCount[label] = (statusCount[label] ?? 0) + 1;

      if (escrow.released) {
        released += usdc;
        completed += 1;
      } else if (escrow.refunded) {
        refunded += 1;
      } else {
        if (escrow.funded) locked += usdc;
        active += 1;
      }
      if (escrow.disputed) disputed += 1;

      if (escrow.client) {
        const key = String(escrow.client).toLowerCase();
        clientVol.set(key, (clientVol.get(key) ?? 0) + usdc);
      }
      if (escrow.freelancer) {
        const key = String(escrow.freelancer).toLowerCase();
        freelancerVol.set(key, (freelancerVol.get(key) ?? 0) + usdc);
      }
    }

    // Volume buckets — 7 daily bars, 30 daily bars, or weekly bars for "all".
    let dayBuckets;
    if (range === "all") {
      const times = filtered
        .map((e) => (e.createdAt ? Number(e.createdAt) * 1000 : now))
        .filter((t) => t <= now);
      const earliest = times.length ? Math.min(...times) : now;
      const weekStart = new Date(earliest);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekCount = Math.max(1, Math.ceil((now - weekStart.getTime()) / (7 * 86_400_000)));
      dayBuckets = Array.from({ length: weekCount }, (_, i) => {
        const start = new Date(weekStart.getTime() + i * 7 * 86_400_000);
        const end = new Date(Math.min(start.getTime() + 7 * 86_400_000, now));
        return {
          dayStart: start,
          dayEnd: end,
          volume: 0,
          count: 0,
          label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        };
      });
    } else {
      const days = range === "7d" ? 7 : 30;
      dayBuckets = Array.from({ length: days }, (_, i) => {
        const dayStart = new Date(now - (days - 1 - i) * 86_400_000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 86_400_000);
        return {
          dayStart,
          dayEnd,
          volume: 0,
          count: 0,
          label:
            range === "7d"
              ? dayStart.toLocaleDateString(undefined, { weekday: "narrow" })
              : String(dayStart.getDate()),
        };
      });
    }

    for (const escrow of filtered) {
      const createdMs = escrow.createdAt ? Number(escrow.createdAt) * 1000 : null;
      const bucket = createdMs
        ? dayBuckets.find((b) => createdMs >= b.dayStart.getTime() && createdMs < b.dayEnd.getTime())
        : dayBuckets[dayBuckets.length - 1];
      if (bucket) {
        bucket.volume += toUsdc(escrow.amount);
        bucket.count += 1;
      }
    }

    // Sparse x-axis labels when there are many buckets (30d / all-time).
    const labelEvery = dayBuckets.length > 12 ? Math.ceil(dayBuckets.length / 8) : 1;
    dayBuckets = dayBuckets.map((b, i) => ({
      ...b,
      showLabel: i % labelEvery === 0 || i === dayBuckets.length - 1,
    }));

    const topClients = [...clientVol.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([addr, vol]) => ({ addr, vol }));

    const topFreelancers = [...freelancerVol.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([addr, vol]) => ({ addr, vol }));

    const maxVolume = Math.max(...dayBuckets.map((b) => b.volume), 1);
    const disputeRate = totalAmount > 0 ? (disputed / filtered.length) * 100 : 0;

    return {
      escrowCount: filtered.length,
      totalAmount,
      locked,
      released,
      active,
      disputed,
      completed,
      refunded,
      statusCount,
      dayBuckets,
      maxVolume,
      topClients,
      topFreelancers,
      disputeRate,
      rangeLabel: range === "7d" ? "7 days" : range === "30d" ? "30 days" : "all time",
      volumeLabel: range === "all" ? "Volume — all time" : `Volume — last ${range === "7d" ? "7 days" : "30 days"}`,
    };
  }, [escrows, range]);

  const showChart = stats.dayBuckets.some((b) => b.volume > 0 || b.count > 0);

  if (loading && !propEscrows) {
    return (
      <section id="analytics" className="card analytics-panel">
        <div className="summary-header">
          <div>
            <h3>📊 Analytics</h3>
            <p>Live escrow metrics computed from the contract</p>
          </div>
          <span className="status-badge live">Live</span>
        </div>
        <p className="section-copy">Loading analytics from the chain…</p>
      </section>
    );
  }

  return (
    <section id="analytics" className="card analytics-panel">
      <div className="summary-header">
        <div>
          <h3>📊 Analytics</h3>
          <p>Live escrow metrics computed from the contract</p>
        </div>
        <span className="status-badge live">Live</span>
      </div>

      <div className="analytics-toolbar">
        <span className="analytics-range-label">Range</span>
        <div className="analytics-range" role="tablist" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className={range === r.id ? "active" : ""}
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {stats.escrowCount === 0 ? (
        <p className="section-copy">
          No escrow data yet — create an escrow to see live analytics here.
        </p>
      ) : (
        <>
          <div className="analytics-stats-grid">
            <StatCard
              label="Locked USDC"
              value={formatAmount(BigInt(Math.round(stats.locked * 1e6)))}
              sub={`${stats.escrowCount} escrows · ${stats.rangeLabel}`}
              accent="#60a5fa"
            />
            <StatCard
              label="Released"
              value={formatAmount(BigInt(Math.round(stats.released * 1e6)))}
              sub={`${stats.completed} completed`}
              accent="#34d399"
            />
            <StatCard
              label="Active"
              value={stats.active}
              sub={`${stats.disputed} disputed`}
              accent="#a78bfa"
            />
            <StatCard
              label="Dispute rate"
              value={`${stats.disputeRate.toFixed(1)}%`}
              sub={`${stats.refunded} refunded`}
              accent={stats.disputeRate > 20 ? "#f87171" : "#fbbf24"}
            />
          </div>

          <div className="analytics-section">
            <h4>{stats.volumeLabel}</h4>
            {showChart ? (
              <div className="analytics-chart">
                {stats.dayBuckets.map((b, i) => (
                  <div className="analytics-chart-col" key={i} title={`${b.volume.toFixed(2)} USDC · ${b.count} escrow(s)`}>
                    <div
                      className="analytics-chart-bar"
                      style={{
                        height: `${Math.max(4, (b.volume / stats.maxVolume) * 100)}%`,
                        opacity: b.volume > 0 ? 1 : 0.35,
                      }}
                    />
                    {b.showLabel ? (
                      <span className="analytics-chart-label">{b.label}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="section-copy">No activity in the selected range.</p>
            )}
          </div>

          <div className="analytics-section">
            <h4>Status breakdown</h4>
            <div className="analytics-breakdown">
              {Object.entries(stats.statusCount).map(([label, count]) => (
                <div className="analytics-breakdown-row" key={label}>
                  <span className="analytics-breakdown-dot" style={{ background: STATUS_COLORS[label] ?? "#6b7280" }} />
                  <span className="analytics-breakdown-label">{label}</span>
                  <span className="analytics-breakdown-count">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="analytics-section">
            <h4>Top by volume</h4>
            <div className="analytics-parties">
              <div>
                <span className="analytics-party-head">Clients</span>
                {stats.topClients.length ? (
                  stats.topClients.map(({ addr, vol }) => (
                    <div className="analytics-party-row" key={addr}>
                      <span>{shortenAddress(addr)}</span>
                      <strong>{vol.toFixed(2)} USDC</strong>
                    </div>
                  ))
                ) : (
                  <span className="analytics-party-empty">No clients yet</span>
                )}
              </div>
              <div>
                <span className="analytics-party-head">Freelancers</span>
                {stats.topFreelancers.length ? (
                  stats.topFreelancers.map(({ addr, vol }) => (
                    <div className="analytics-party-row" key={addr}>
                      <span>{shortenAddress(addr)}</span>
                      <strong>{vol.toFixed(2)} USDC</strong>
                    </div>
                  ))
                ) : (
                  <span className="analytics-party-empty">No freelancers yet</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default AnalyticsPanel;
