import { useState } from "react";
import { toast } from "../lib/toast";
import { useWalletBridge } from "../hooks/useWalletBridge";

function WalletPanel({ wallet, onCircleChange: _onCircleChange }) {
  const { isConnected, disconnect: reownDisconnect } = useWalletBridge();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      if (isConnected && reownDisconnect) {
        try {
          await reownDisconnect();
        } catch {
          /* AppKit may already be disconnected — ignore */
        }
      }
      toast("Wallet disconnected", "warning", { duration: 4000 });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <section className="card wallet-card">
      <div className="wallet-header">
        <div>
          <h3>💼 Wallet Overview</h3>
          <p>Your connected wallet status</p>
        </div>

        <span className={`wallet-badge ${wallet.connected ? "connected" : "disconnected"}`}>
          <span className="status-dot" />
          {wallet.connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {wallet.connected && (
        <button
          type="button"
          className="premium-action-btn premium-action-btn--cancel wallet-unified-disconnect"
          onClick={handleDisconnect}
          disabled={disconnecting}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect Wallet"}
        </button>
      )}

      <div className="wallet-info">
        <div className="wallet-item">
          <span>Network</span>
          <strong>{wallet.network}</strong>
        </div>

        <div className="wallet-item">
          <span>USDC Balance</span>
          <strong>{wallet.loading ? "Loading..." : wallet.balance}</strong>
        </div>

        <div className="wallet-item">
          <span>Wallet Status</span>
          <strong>{wallet.connected ? "Active" : "Inactive"}</strong>
        </div>

        <div className="wallet-item">
          <span>Address</span>
          <strong>{wallet.address}</strong>
        </div>
      </div>
    </section>
  );
}

export default WalletPanel;
