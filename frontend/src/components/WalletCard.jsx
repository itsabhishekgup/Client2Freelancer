import { useEffect, useState } from "react";
import { connectWallet } from "../contracts/wallet";

function WalletCard() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    async function loadWallet() {
      const data = await connectWallet();
      setWallet(data);
    }

    loadWallet();
  }, []);

  return (
    <div className="card wallet-card">
      <div className="wallet-header">
        <div>
          <h3>💼 Wallet Overview</h3>
          <p>Your connected wallet status</p>
        </div>

        <span className="wallet-badge">
          {wallet ? "🟢 Connected" : "🔴 Disconnected"}
        </span>
      </div>

      <div className="wallet-item">
        <span>USDC Balance</span>
        <strong>
          {wallet ? `${Number(wallet.usdcBalance).toFixed(2)} USDC` : "-- USDC"}
        </strong>
      </div>

      <div className="wallet-item">
        <span>Wallet Status</span>
        <strong>{wallet ? "Active" : "Disconnected"}</strong>
      </div>

      <div className="wallet-item">
        <span>Address</span>
        <strong>
          {wallet
            ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
            : "--"}
        </strong>
      </div>
    </div>
  );
}

export default WalletCard;
