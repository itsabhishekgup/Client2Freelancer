import { useState } from "react";
import { BrowserProvider } from "ethers";

function Navbar() {
  const [wallet, setWallet] = useState("");

  async function connectWallet() {
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    const provider = new BrowserProvider(window.ethereum);

    const accounts = await provider.send(
      "eth_requestAccounts",
      []
    );

    setWallet(accounts[0]);
  }

  return (
    <nav>
      <h2>ArcBridge Escrow</h2>

      <button onClick={connectWallet}>
        {wallet
          ? wallet.slice(0, 6) + "..." + wallet.slice(-4)
          : "Connect Wallet"}
      </button>
    </nav>
  );
}

export default Navbar;