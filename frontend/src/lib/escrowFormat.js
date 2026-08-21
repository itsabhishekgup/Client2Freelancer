import { formatUnits } from "ethers";

export const STEPS = [
  "Create Escrow",
  "Approve USDC",
  "Deposit Funds",
  "Submit Work",
  "Approve Work",
  "Release Funds",
];

export const ACTIVITY_META = {
  EscrowCreated: { label: "Escrow Created", tone: "completed", icon: "✨" },
  FundsDeposited: { label: "Funds Deposited", tone: "funded", icon: "💰" },
  WorkSubmitted: { label: "Work Submitted", tone: "submitted", icon: "📝" },
  WorkApproved: { label: "Work Approved", tone: "approved", icon: "✅" },
  FundsReleased: { label: "Funds Released", tone: "completed", icon: "🚀" },
  EscrowCancelled: { label: "Escrow Cancelled", tone: "cancelled", icon: "↩️" },
  DisputeRaised: { label: "Dispute Raised", tone: "disputed", icon: "⚠️" },
  DisputeResolved: { label: "Dispute Resolved", tone: "completed", icon: "⚖️" },
  TokensRescued: { label: "Recovery Executed", tone: "completed", icon: "🛟" },
};

export function shortenAddress(address) {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function normalizeEscrowId(value) {
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

export function formatRelativeTime(timestampSeconds) {
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

// Human countdown to an expiry timestamp (seconds). Returns { text, tone }:
//   tone "urgent"  — less than 24h left
//   tone "warning" — less than 7 days left
//   tone "ok"      — more than 7 days left
//   tone "expired" — already past
// The `nowSeconds` parameter lets callers drive a live tick (a 30s/60s timer)
// without re-creating the formatter.
export function formatExpiry(expirySeconds, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!expirySeconds || Number(expirySeconds) <= 0) {
    return { text: "Clock starts at funding", tone: "ok" };
  }

  const target = Number(expirySeconds);
  const diff = target - nowSeconds;

  if (diff <= 0) {
    const ago = Math.max(1, Math.floor(Math.abs(diff) / 60));
    if (ago < 60) return { text: `Expired ${ago}m ago`, tone: "expired" };
    const hours = Math.floor(ago / 60);
    if (hours < 24) return { text: `Expired ${hours}h ago`, tone: "expired" };
    return { text: `Expired ${Math.floor(hours / 24)}d ago`, tone: "expired" };
  }

  const totalMinutes = Math.floor(diff / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let text;
  if (days > 0) {
    text = `Expires in ${days}d ${hours}h`;
  } else if (hours > 0) {
    text = `Expires in ${hours}h ${minutes}m`;
  } else {
    text = `Expires in ${minutes}m`;
  }

  let tone = "ok";
  if (days === 0 && hours < 24) tone = "urgent";
  else if (days < 7) tone = "warning";

  return { text, tone };
}

// Compact "X remaining" label used on cards; null when the escrow has no
// deadline clock running yet.
export function formatExpiryShort(expirySeconds, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!expirySeconds || Number(expirySeconds) <= 0) return null;
  const { text, tone } = formatExpiry(expirySeconds, nowSeconds);
  return { text, tone };
}

export function formatAmount(amount) {
  if (amount === null || amount === undefined || amount === "") return "--";
  try {
    return `${Number(formatUnits(amount ?? 0n, 6)).toFixed(2)} USDC`;
  } catch {
    return "--";
  }
}

export function getEscrowStatusMeta(escrow) {
  if (!escrow) return { label: "Waiting", className: "waiting" };
  if (escrow.disputed) return { label: "Disputed", className: "disputed" };
  if (escrow.refunded) return { label: "Refunded", className: "refunded" };
  if (escrow.released) return { label: "Completed", className: "completed" };
  if (escrow.approved) return { label: "Approved", className: "approved" };
  if (escrow.workSubmitted) return { label: "Work Submitted", className: "submitted" };
  if (escrow.funded) return { label: "Funded", className: "funded" };
  return { label: "Waiting", className: "waiting" };
}

export function getWorkflowStep(escrow) {
  if (!escrow) return 0;
  if (escrow.disputed) return -1; // terminal: dispute pending arbitration
  if (escrow.released) return 6;
  if (escrow.refunded) return -2; // terminal: cancelled/refunded
  if (escrow.approved) return 5;
  if (escrow.workSubmitted) return 4;
  if (escrow.funded) return 3;
  return 1;
}

// Human-readable label for a terminal/non-linear escrow state, or null when the
// escrow is on the normal forward path.
export function getWorkflowTerminalLabel(escrow) {
  if (!escrow) return null;
  if (escrow.disputed) return "Disputed — awaiting arbitration";
  if (escrow.refunded) return "Cancelled & refunded";
  if (escrow.released) return "Completed — funds released";
  return null;
}

// Rich metadata for the terminal stepper card: an SVG-friendly icon id, a
// short title, a subtitle line, and a tone used for theming (green/amber/red).
export function getWorkflowTerminalMeta(escrow) {
  if (!escrow) return null;
  if (escrow.disputed) {
    return {
      icon: "dispute",
      title: "Disputed",
      subtitle: "Awaiting arbitration decision",
      tone: "red",
    };
  }
  if (escrow.refunded) {
    return {
      icon: "cancel",
      title: "Cancelled",
      subtitle: "Funds refunded to the client",
      tone: "amber",
    };
  }
  if (escrow.released) {
    return {
      icon: "check",
      title: "Completed",
      subtitle: "Funds released to the freelancer",
      tone: "green",
    };
  }
  return null;
}

export function mapEscrowState(data, id) {
  const client = data?.client ?? data?.[0];
  const freelancer = data?.freelancer ?? data?.[1];
  const amount = data?.amount ?? data?.[2];
  const funded = data?.funded ?? data?.[3];
  const workSubmitted = data?.workSubmitted ?? data?.[4];
  const approved = data?.approved ?? data?.[5];
  const released = data?.released ?? data?.[6];
  const refunded = data?.refunded ?? data?.[7];
  const disputed = data?.disputed ?? data?.[8];
  const createdAt = data?.createdAt ?? data?.[9];
  const expiresAt = data?.expiresAt ?? data?.[10];

  return {
    id: String(id),
    client,
    freelancer,
    amount,
    funded: Boolean(funded),
    workSubmitted: Boolean(workSubmitted),
    approved: Boolean(approved),
    released: Boolean(released),
    refunded: Boolean(refunded),
    disputed: Boolean(disputed),
    createdAt,
    expiresAt,
  };
}
