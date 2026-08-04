import { useEffect, useState } from "react";

function EscrowSummary({ escrowId }) {
  const [escrow, setEscrow] = useState(null);

  useEffect(() => {
    setEscrow({
      id: escrowId || "--",
      client: "Connected",
      freelancer: "Assigned",
      amount: "2 USDC",
      status: "🟡 Waiting",
    });
  }, [escrowId]);

  return (
    <div className="card escrow-summary">
      <h3>📋 Escrow Summary</h3>

      <p className="summary-subtitle">Current escrow details</p>

      <div className="summary-item">
        <span>Escrow ID</span>
        <strong>{escrow?.id ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Client</span>
        <strong>{escrow?.client ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Freelancer</span>
        <strong>{escrow?.freelancer ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Amount</span>
        <strong>{escrow?.amount ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Status</span>
        <strong className="status waiting">{escrow?.status ?? "--"}</strong>
      </div>
    </div>
  );
}

export default EscrowSummary;
