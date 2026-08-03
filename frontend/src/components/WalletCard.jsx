function WalletCard() {
  return (
    <div className="card wallet-card">

      <div className="wallet-header">
        <div>
          <h3>💼 Wallet Overview</h3>
          <p>Your connected wallet status</p>
        </div>

        <span className="wallet-badge">
          🟢 Connected
        </span>
      </div>

      <div className="wallet-item">
        <span>Network</span>
        <strong>Arc Testnet</strong>
      </div>

      <div className="wallet-item">
        <span>USDC Balance</span>
        <strong>-- USDC</strong>
      </div>

      <div className="wallet-item">
        <span>Wallet Status</span>
        <strong>Active</strong>
      </div>

    </div>
  );
}

export default WalletCard;