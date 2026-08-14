function EscrowSummaryPanel({ escrow, loading, error }) {
  return (
    <section className="card escrow-summary">
      <div className="summary-header">
        <div>
          <h3>📋 Escrow Summary</h3>
          <p>Current live escrow from blockchain</p>
        </div>

        <span className={`status-badge ${escrow?.status?.className || "waiting"}`}>
          {escrow?.status?.label || "Waiting"}
        </span>
      </div>

      <p className="summary-subtitle">
        {loading
          ? "Loading live escrow details..."
          : error
            ? error
            : escrow
              ? "Current escrow details are loaded directly from the contract."
              : "Select or create an escrow to see live details here."}
      </p>

      <div className="summary-item">
        <span>Escrow ID</span>
        <strong>{escrow?.id ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Client</span>
        <strong>{escrow?.clientText ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Freelancer</span>
        <strong>{escrow?.freelancerText ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Amount</span>
        <strong>{escrow?.amountText ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Status</span>
        <strong className={`status-pill ${escrow?.status?.className || "waiting"}`}>
          {escrow?.status?.label || "Waiting"}
        </strong>
      </div>
    </section>
  );
}

export default EscrowSummaryPanel;
