import { useState } from "react";
import { connectWallet } from "../contracts/wallet";

function Navbar() {
  const [wallet, setWallet] = useState("");
  const [usdcBalance, setUsdcBalance] = useState("");

  async function handleConnectWallet() {
    const data = await connectWallet();

    if (data) {
      setWallet(data.address);
      setUsdcBalance(data.usdcBalance);
    }
  }

  return (
    <header className="top-navbar">
      <div className="nav-left">
        <div className="logo-section">
          <h2>🔷 ArcBridge Escrow</h2>

          <span className="network-badge">Arc Testnet</span>
        </div>
      </div>

      <div className="nav-right">
        <button className="connect-wallet-btn" onClick={handleConnectWallet}>
          {wallet
            ? wallet.slice(0, 6) + "..." + wallet.slice(-4)
            : "Connect Wallet"}
        </button>
        {wallet && (
          <p style={{ margintop: "8px" , fontSize: "14px" }}>
            USDC Balance: {usdcBalance}
            </p>
        )}
        </div>
    </header>
  );
}

export default Navbar;
