function EscrowSummary() {
  return (
    <div className="card escrow-summary">

      <h3>📋 Escrow Summary</h3>

      <p className="summary-subtitle">
        Current escrow details
      </p>

      <div className="summary-item">
        <span>Escrow ID</span>
        <strong>#001</strong>
      </div>

      <div className="summary-item">
        <span>Client</span>
        <strong>Not Connected</strong>
      </div>

      <div className="summary-item">
        <span>Freelancer</span>
        <strong>Not Assigned</strong>
      </div>

      <div className="summary-item">
        <span>Amount</span>
        <strong>0 USDC</strong>
      </div>

      <div className="summary-item">
        <span>Status</span>
        <strong className="status waiting">🟡 Waiting</strong>
      </div>

    </div>
  );
}

export default EscrowSummary;