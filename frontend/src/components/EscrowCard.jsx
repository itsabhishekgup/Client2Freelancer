import { formatExpiryShort } from "../lib/escrowFormat";
import { useNow } from "../lib/useNow";

/* Small inline status glyphs — glanceable, no emojis */
function StatusIcon({ statusClass }) {
  const common = {
    viewBox: "0 0 16 16",
    className: "escrow-status-icon",
    "aria-hidden": "true",
    focusable: "false",
  };
  switch (statusClass) {
    case "completed":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5.2 8.2l1.8 1.8 3.8-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "disputed":
      return (
        <svg {...common}>
          <path d="M8 1.6l6.4 11.4H1.6L8 1.6z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 5.8v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
        </svg>
      );
    case "refunded":
      return (
        <svg {...common}>
          <path d="M3 6.5h7a3 3 0 010 6H6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 3.4L3 6.5l3 3.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "funded":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.4V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "submitted":
      return (
        <svg {...common}>
          <path d="M4.6 1.5h4.9l3 3V14.5h-8v-13z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M9.5 1.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      );
    case "approved":
      return (
        <svg {...common}>
          <path d="M2.5 8.5l3 3L13.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2.6" />
          <path d="M8 4.4V8l2.3 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function EscrowCard({ escrow, onSelect }) {
  const handleClick = () => onSelect?.(escrow);
  const now = useNow();
  const expiry = formatExpiryShort(escrow.expiresAt, now);

  return (
    <article
      className="escrow-row-glass escrow-card-clickable escrow-card-compact"
      role="button"
      tabIndex={0}
      aria-label={`View details for escrow ${escrow.id}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Line 1: id + amount + status */}
      <div className="escrow-card-compact-top">
        <div className="escrow-card-compact-id">
          <strong className="escrow-row-title">Escrow #{escrow.id}</strong>
          <span className="escrow-card-compact-amount">{escrow.amountText}</span>
        </div>
        <span className={`status-badge ${escrow.status.className}`}>
          <StatusIcon statusClass={escrow.status.className} />
          {escrow.status.label}
        </span>
      </div>

      {/* Line 1.5: expiry countdown (only when the deadline clock is running) */}
      {expiry && (
        <div className={`escrow-card-compact-expiry escrow-card-compact-expiry--${expiry.tone}`}>
          <svg
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 4.4V8l2.3 1.5" />
          </svg>
          {expiry.text}
        </div>
      )}

      {/* Line 2: parties + click affordance */}
      <div className="escrow-card-compact-parties">
        <span className="escrow-card-compact-party">
          <span className="escrow-card-compact-label">Client</span>
          {escrow.clientText}
        </span>
        <span className="escrow-card-compact-flow" aria-hidden="true">
          →
        </span>
        <span className="escrow-card-compact-party">
          <span className="escrow-card-compact-label">Freelancer</span>
          {escrow.freelancerText}
        </span>
        <span className="escrow-card-compact-chevron" aria-hidden="true">
          ›
        </span>
      </div>
    </article>
  );
}

export default EscrowCard;
