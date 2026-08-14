import { useMemo, useState } from "react";
import EscrowCard from "./EscrowCard";

const PAGE_SIZE = 5;

function EscrowsList({ escrows }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  return (
    <section id="my-escrows" className="card dashboard-section">
      <div className="summary-header">
        <div>
          <h3>📦 My Escrows</h3>
          <p>Live escrow records pulled from the contract</p>
        </div>
        <span className="status-badge live">Live</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "14px",
        }}
      >
        <input
          type="text"
          className="history-search"
          placeholder="Search by ID, client, or freelancer…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          style={{ flex: "1 1 220px", padding: "10px 14px" }}
        />
        <select
          className="history-sort"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setVisibleCount(PAGE_SIZE);
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
        <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
          {visible.map((escrow) => (
            <EscrowCard key={escrow.id} escrow={escrow} />
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
        <div style={{ textAlign: "center", marginTop: "14px" }}>
          <button
            type="button"
            className="premium-action-btn premium-action-btn--load-more"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
      {!hasMore && filtered.length > PAGE_SIZE && (
        <p className="section-copy" style={{ textAlign: "center", marginTop: "12px" }}>
          Showing all {filtered.length} escrows
        </p>
      )}
    </section>
  );
}

export default EscrowsList;
