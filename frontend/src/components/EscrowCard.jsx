function EscrowCard({ escrow }) {
  return (
    <article
      style={{
        padding: "16px",
        borderRadius: "18px",
        background: "rgba(255,255,255,0.74)",
        border: "1px solid rgba(148,163,184,0.14)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <strong style={{ color: "#0f172a", fontSize: "15px" }}>Escrow #{escrow.id}</strong>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>
            {escrow.amountText}
          </p>
        </div>
        <span className={`status-badge ${escrow.status.className}`}>{escrow.status.label}</span>
      </div>

      <div className="summary-item">
        <span>Client</span>
        <strong>{escrow.clientText}</strong>
      </div>
      <div className="summary-item">
        <span>Freelancer</span>
        <strong>{escrow.freelancerText}</strong>
      </div>
    </article>
  );
}

export default EscrowCard;
