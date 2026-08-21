import { useEffect } from "react";
import { arcTestnet } from "../contracts/arcChain";
import { formatAmount, formatExpiry, shortenAddress } from "../lib/escrowFormat";
import { useNow } from "../lib/useNow";

const EXPLORER_URL = arcTestnet.blockExplorers?.default?.url ?? "";
const explorerLink = (txHash) =>
  EXPLORER_URL && txHash ? `${EXPLORER_URL}/tx/${txHash}` : null;

const TONE_COLORS = {
  completed: "#16a34a",
  funded: "#2563eb",
  submitted: "#ea580c",
  approved: "#7c3aed",
  cancelled: "#ca8a04",
  disputed: "#dc2626",
  waiting: "#6b7280",
};

function formatTimestamp(value) {
  if (!value) return "--";
  const ms = Number(value) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return "--";
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({ label, value }) {
  return (
    <div className="escrow-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// When no on-chain events are cached for this escrow, render a state checklist
// from the escrow's booleans so the modal is never empty.
function StateChecklist({ escrow }) {
  const steps = [
    { done: true, label: "Escrow created" },
    { done: Boolean(escrow.funded), label: "Funds deposited" },
    { done: Boolean(escrow.workSubmitted), label: "Work submitted" },
    { done: Boolean(escrow.approved), label: "Work approved" },
    { done: Boolean(escrow.released || escrow.refunded), label: escrow.refunded ? "Refunded to client" : "Funds released" },
  ];

  return (
    <div className="escrow-state-checklist">
      {steps.map((step, i) => (
        <div key={i} className={`state-step ${step.done ? "done" : ""}`}>
          <span className="state-step-dot" />
          <span className="state-step-label">{step.label}</span>
          <span className="state-step-tag">{step.done ? "✓" : "Pending"}</span>
        </div>
      ))}
    </div>
  );
}

function EscrowDetailModal({ escrow, events = [], onClose }) {
  const now = useNow();
  const expiry = escrow?.expiresAt ? formatExpiry(escrow.expiresAt, now) : null;

  useEffect(() => {
    if (!escrow) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [escrow, onClose]);

  if (!escrow) return null;

  const timeline = [...events]
    .sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
      return (a.logIndex ?? 0) - (b.logIndex ?? 0);
    })
    .map((event, index) => ({ ...event, index }));

  return (
    <div className="escrow-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="escrow-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Escrow ${escrow.id} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="escrow-modal-head">
          <div>
            <h3>Escrow #{escrow.id}</h3>
            <p>Full lifecycle on Arc Testnet</p>
          </div>
          <span className={`status-badge ${escrow.status.className}`}>
            {escrow.status.label}
          </span>
          <button
            type="button"
            className="escrow-modal-close"
            aria-label="Close escrow details"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="escrow-detail-grid">
          <DetailRow label="Amount" value={escrow.amountText ?? formatAmount(escrow.amount)} />
          <DetailRow label="Client" value={escrow.clientText ?? shortenAddress(escrow.client)} />
          <DetailRow label="Freelancer" value={escrow.freelancerText ?? shortenAddress(escrow.freelancer)} />
          <DetailRow label="Created" value={formatTimestamp(escrow.createdAt)} />
          <DetailRow
            label="Expires"
            value={
              expiry
                ? `${formatTimestamp(escrow.expiresAt)} · ${expiry.text}`
                : formatTimestamp(escrow.expiresAt)
            }
          />
          <DetailRow label="On-chain ID" value={String(escrow.id)} />
        </div>

        <div className="escrow-modal-section">
          <h4>Lifecycle</h4>
          {timeline.length ? (
            <div className="escrow-timeline">
              {timeline.map((event) => {
                const href = explorerLink(event.txHash);
                return (
                  <div key={event.key ?? `${event.txHash}-${event.index}`} className="timeline-item">
                    <div
                      className="timeline-marker"
                      style={{ background: TONE_COLORS[event.tone] ?? "#6b7280" }}
                    >
                      {event.icon ?? "•"}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-head">
                        <strong>{event.label}</strong>
                        <span>{event.timeAgo}</span>
                      </div>
                      <p>{event.detail}</p>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="timeline-tx"
                        >
                          {shortenAddress(event.txHash)} ↗
                        </a>
                      ) : (
                        <span className="timeline-tx timeline-tx--plain">
                          {shortenAddress(event.txHash)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <p className="section-copy">
                No cached on-chain events for this escrow — showing its current state.
              </p>
              <StateChecklist escrow={escrow} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default EscrowDetailModal;
