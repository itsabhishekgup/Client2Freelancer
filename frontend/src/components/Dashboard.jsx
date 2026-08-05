import { useEffect } from "react";
import CreateEscrow from "./CreateEscrow";
import EscrowSummary from "./EscrowSummary";
import HelpCenter from "./HelpCenter";
import ProgressStepper from "./ProgressStepper";
import WalletCard from "./WalletCard";

function Dashboard({
  activeSection = "dashboard",
  onNavigate,
  currentStep = 0,
  setCurrentStep = () => {},
  escrowId = "",
  setEscrowId = () => {},
}) {
  useEffect(() => {
    const target = document.getElementById(activeSection);
    if (target) {
      window.requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [activeSection]);

  return (
    <main className="dashboard">
      <section id="dashboard" className="dashboard-header">
        <p className="dashboard-kicker">Arc Network • Live Escrow Dashboard</p>
        <h1>Secure USDC Escrow Platform</h1>
        <p className="dashboard-lead">
          Trustless payments for freelancers powered by Arc Network.
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          <ProgressStepper currentStep={currentStep} />

          <section id="create-escrow" className="dashboard-block">
            <CreateEscrow
              escrowId={escrowId}
              setEscrowId={setEscrowId}
              setCurrentStep={setCurrentStep}
            />
          </section>

          <section className="card activity-card">
            <div className="summary-header">
              <div>
                <h3>Recent Activity</h3>
                <p>Live actions will appear here after each transaction</p>
              </div>
              <span className="status-badge waiting">Waiting</span>
            </div>

            <div className="activity-empty">
              <strong>No recent activity yet</strong>
              <p>
                Create, fund, submit, approve, and release an escrow to populate this
                section.
              </p>
            </div>
          </section>
        </section>

        <aside className="dashboard-side">
          <WalletCard />

          <section className="card quick-help-card">
            <div className="summary-header">
              <div>
                <h3>Need Help?</h3>
                <p>Jump directly to the help section</p>
              </div>
            </div>

            <p className="quick-help-text">
              Open the help center for escrow steps, tips, and troubleshooting.
            </p>

            <button
              type="button"
              className="help-cta"
              onClick={() => onNavigate?.("help-center")}
            >
              Open Help Center
            </button>
          </section>

          <EscrowSummary escrowId={escrowId} />
        </aside>
      </div>

      <section id="my-escrows" className="card dashboard-section">
        <div className="summary-header">
          <div>
            <h3>📦 My Escrows</h3>
            <p>Your escrow history will appear here</p>
          </div>
        </div>

        <p className="section-copy">
          This section is ready for live escrow listings from the chain.
        </p>
      </section>

      <section id="transactions" className="card dashboard-section">
        <div className="summary-header">
          <div>
            <h3>💸 Transactions</h3>
            <p>On-chain activity and contract events</p>
          </div>
        </div>

        <p className="section-copy">
          Use this space for escrow-created, funded, submitted, approved, and released
          events once you hook the contract logs.
        </p>
      </section>

      <section id="settings" className="card dashboard-section">
        <div className="summary-header">
          <div>
            <h3>⚙️ Settings</h3>
            <p>Wallet and UI preferences</p>
          </div>
        </div>

        <p className="section-copy">
          Theme controls, network hints, and other preferences can live here later.
        </p>
      </section>

      <HelpCenter />
    </main>
  );
}

export default Dashboard;
