function WalletPanel({ wallet }) {
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
