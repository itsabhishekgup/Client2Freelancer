import { useState } from "react";
import WalletCard from "./WalletCard";
import EscrowSummary from "./EscrowSummary";
import ProgressStepper from "./ProgressStepper";
import HelpCenter from "./HelpCenter";
import CreateEscrow from "./CreateEscrow";

function Dashboard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [escrowId, setEscrowId] = useState("");

  return (
    <main className="dashboard">
      <div className="dashboard-header">
        <h1>Secure USDC Escrow Platform</h1>
        <p>Trustless payments for freelancers powered by Arc Network.</p>
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-main">
          <ProgressStepper currentStep={currentStep} />
          <CreateEscrow escrowId={escrowId} setEscrowId={setEscrowId} setCurrentStep={setCurrentStep} />
        </div>

        <div className="dashboard-side">
          <WalletCard />
          <EscrowSummary escrowId={escrowId} />
          <HelpCenter />
        </div>
      </div>
    </main>
  );
}

export default Dashboard;
