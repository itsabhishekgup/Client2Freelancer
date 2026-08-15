function EscrowCard({ escrow, onSelect }) {
  const handleClick = () => onSelect?.(escrow);

  return (
    <article
      className="escrow-row-glass escrow-card-clickable"
      style={{ padding: "16px", borderRadius: "18px" }}
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
          <strong className="escrow-row-title" style={{ fontSize: "15px" }}>
            Escrow #{escrow.id}
          </strong>
          <p className="escrow-row-sub" style={{ margin: "4px 0 0", fontSize: "13px" }}>
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

      <div className="escrow-card-footer">
        <span className="escrow-card-view">View details</span>
        <span className="escrow-card-arrow">→</span>
      </div>
    </article>
  );
}

export default EscrowCard;
