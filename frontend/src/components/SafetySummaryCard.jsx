import { useEffect, useState } from "react";
import { fetchSafety } from "../lib/liveApi";

// Compact dashboard card. All values come from the backend /safety endpoint,
// which reads real contract state — nothing here is fabricated.
// Refreshes every POLL_MS (and on tab re-focus); refresh failures keep the
// last good snapshot instead of flashing "unavailable".
const POLL_MS = 20000;

function SafetySummaryCard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (initial = false) => {
      try {
        const snap = await fetchSafety({ signal: null });
        if (!cancelled) setData(snap);
      } catch (err) {
        if (!cancelled && initial) setError(err?.message || "Unavailable");
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

  const contract = data?.contract;
  const checks = data?.checks ?? {};

  const healthy = Boolean(
    checks.chain_healthy && checks.contract_readable && checks.escrow_isolation,
  );
  const recoverableWei = contract?.recoverable_wei != null ? BigInt(contract.recoverable_wei) : 0n;
  const hasRecoverable = recoverableWei > 0n;
  const hasAlerts = !healthy || hasRecoverable;

  const statusLabel = hasAlerts ? "Action Required" : "All Systems Protected";
  const statusState = hasAlerts ? "critical" : "healthy";

  const protectedValue = contract?.locked ?? "--";

  return (
    <section className="card safety-summary-card">
      <div className="summary-header">
        <div>
          <h3>🛡️ ArcBridge Safety</h3>
          <p>Contract security status</p>
        </div>
        <span className={`safety-summary-state safety-summary-state--${statusState}`}>
          <span className="safety-summary-dot" aria-hidden="true">
            {hasAlerts ? "🔴" : "🟢"}
          </span>
          {statusLabel}
        </span>
      </div>

      {loading ? (
        <p className="section-copy">Reading safety state…</p>
      ) : error ? (
        <>
          <p className="section-copy">Safety data is unavailable right now.</p>
          <button
            type="button"
            className="help-cta safety-summary-cta"
            onClick={() => onNavigate?.("safety-center")}
          >
            View Safety Center →
          </button>
        </>
      ) : (
        <>
          <div className="safety-summary-rows">
            <div className="summary-item">
              <span>Contract</span>
              <strong className={healthy ? "safety-ok" : "safety-warn"}>
                {healthy ? "🟢 Healthy" : "🔴 Attention"}
              </strong>
            </div>
            <div className="summary-item">
              <span>Protected Funds</span>
              <strong>{protectedValue}</strong>
            </div>
            <div className="summary-item">
              <span>Recoverable Assets</span>
              <strong>{hasRecoverable ? `1 (${contract.recoverable})` : "0"}</strong>
            </div>
            <div className="summary-item">
              <span>Security Alerts</span>
              <strong>{hasAlerts ? "Review" : "None"}</strong>
            </div>
          </div>

          {hasRecoverable && (
            <div className="safety-summary-alert">
              <span>
                {contract.recoverable} USDC is recoverable — review it in the Safety Center.
              </span>
            </div>
          )}

          <button
            type="button"
            className="help-cta safety-summary-cta"
            onClick={() => onNavigate?.("safety-center")}
          >
            View Safety Center →
          </button>
        </>
      )}
    </section>
  );
}

export default SafetySummaryCard;
