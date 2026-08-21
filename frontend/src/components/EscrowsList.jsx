import { useMemo, useState } from "react";
import EscrowCard from "./EscrowCard";
import { formatExpiry } from "../lib/escrowFormat";

// Only the most recent escrow shows by default; the rest appear behind
// "Show more" so the dashboard stays short.
const INITIAL_VISIBLE = 1;
const LOAD_STEP = 5;

// Escape a single CSV cell: quote it when it contains a comma, quote, or
// newline, and double any embedded quotes (RFC 4180).
function csvCell(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

// Build a CSV document from the escrow list. Exporting the currently filtered
// set keeps the file consistent with what the user sees on screen.
function buildEscrowsCsv(escrows) {
  const header = [
    "id",
    "status",
    "amount_usdc",
    "client",
    "freelancer",
    "created_at",
    "expires_at",
    "expiry_countdown",
  ];
  const now = Math.floor(Date.now() / 1000);
  const rows = escrows.map((escrow) => {
    const amount = escrow.amountText ?? escrow.amount ?? "--";
    const created = escrow.createdAt
      ? new Date(Number(escrow.createdAt) * 1000).toISOString()
      : "";
    const expires = escrow.expiresAt
      ? new Date(Number(escrow.expiresAt) * 1000).toISOString()
      : "";
    const expiry = formatExpiry(escrow.expiresAt, now);
    return [
      escrow.id,
      escrow.status?.label ?? "Waiting",
      amount,
      escrow.client ?? "",
      escrow.freelancer ?? "",
      created,
      expires,
      expiry.text,
    ];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function downloadCsv(filename, csv) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function EscrowsList({ escrows, onSelectEscrow }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return escrows.filter((escrow) => {
      if (statusFilter !== "all" && escrow.status.label !== statusFilter) {
        return false;
      }
      if (!query) return true;
      return (
        String(escrow.id).includes(query) ||
        String(escrow.client ?? "").toLowerCase().includes(query) ||
        String(escrow.freelancer ?? "").toLowerCase().includes(query)
      );
    });
  }, [escrows, search, statusFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const handleExportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`arcbridge-escrows-${stamp}.csv`, buildEscrowsCsv(filtered));
  };

  return (
    <section id="my-escrows" className="card dashboard-section">
      <div className="summary-header">
        <div>
          <h3>📦 My Escrows</h3>
          <p>Live escrow records pulled from the contract</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="status-badge live">Live</span>
          <button
            type="button"
            className="premium-action-btn premium-action-btn--load-more"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            title={
              filtered.length === 0
                ? "No escrows to export"
                : `Export ${filtered.length} escrow${filtered.length === 1 ? "" : "s"} to CSV`
            }
            style={{ padding: "6px 12px", fontSize: "12px" }}
          >
            ⬇ Export CSV
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginTop: "10px",
        }}
      >
        <input
          type="text"
          className="history-search"
          placeholder="Search by ID, client, or freelancer…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(INITIAL_VISIBLE);
          }}
          style={{ flex: "1 1 220px", padding: "10px 14px" }}
        />
        <select
          className="history-sort"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setVisibleCount(INITIAL_VISIBLE);
          }}
          style={{ padding: "10px 14px" }}
        >
          <option value="all">All statuses</option>
          <option>Waiting</option>
          <option>Funded</option>
          <option>Work Submitted</option>
          <option>Approved</option>
          <option>Completed</option>
          <option>Disputed</option>
          <option>Refunded</option>
        </select>
      </div>

      {visible.length ? (
        <div style={{ display: "grid", gap: "8px", marginTop: "10px" }}>
          {visible.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} onSelect={onSelectEscrow} />
          ))}
        </div>
      ) : (
        <p className="section-copy">
          {escrows.length
            ? "No escrows match your search or filter."
            : "No escrows found yet. Create one to see live records here."}
        </p>
      )}

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <button
            type="button"
            className="premium-action-btn premium-action-btn--load-more"
            onClick={() => setVisibleCount((count) => count + LOAD_STEP)}
          >
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
      {!hasMore && filtered.length > INITIAL_VISIBLE && (
        <p className="section-copy" style={{ textAlign: "center", marginTop: "8px" }}>
          Showing all {filtered.length} escrows
        </p>
      )}
    </section>
  );
}

export default EscrowsList;
