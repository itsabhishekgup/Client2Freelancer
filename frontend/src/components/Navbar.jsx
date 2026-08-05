import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import { connectWallet } from "../contracts/wallet";
import { USDC_ABI } from "../contracts/USDCABI";
import { USDC_ADDRESS } from "../contracts/constants";

const shortenAddress = (address) => {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

function Navbar({ onNavigate }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [usdcBalance, setUsdcBalance] = useState("");
  const [connecting, setConnecting] = useState(false);

  const syncWallet = useCallback(async () => {
    if (!window.ethereum) return;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);

      if (!accounts || accounts.length === 0) {
        setWalletAddress("");
        setUsdcBalance("");
        return;
      }

      const address = accounts[0];
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance = await usdc.balanceOf(address);

      setWalletAddress(address);
      setUsdcBalance(Number(formatUnits(balance, 6)).toFixed(2));
    } catch (error) {
      console.error("Navbar wallet sync error:", error);
    }
  }, []);

  useEffect(() => {
    syncWallet();

    if (!window.ethereum) return undefined;

    const handleAccountsChanged = () => syncWallet();
    const handleChainChanged = () => syncWallet();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [syncWallet]);

  const handleConnectWallet = async () => {
    setConnecting(true);
    try {
      const data = await connectWallet();
      if (data?.address) {
        setWalletAddress(data.address);
        setUsdcBalance(Number(data.usdcBalance).toFixed(2));
      }
    } finally {
      setConnecting(false);
    }
  };

  return (
    <header className="top-navbar">
      <div className="nav-left">
        <div className="logo-section">
          <img src="/arc-logo.svg" alt="Arc logo" className="brand-image" />
          <div className="brand-copy">
            <h2>ArcBridge Escrow</h2>
            <p>Secure Payments on Arc</p>
          </div>
        </div>

        <span className="network-badge">Arc Testnet</span>
      </div>

      <div className="nav-right">
        <button
          type="button"
          className="help-btn"
          onClick={() => onNavigate?.("help-center")}
        >
          ❔ Help
        </button>

        <button
          type="button"
          className="wallet-pill"
          onClick={handleConnectWallet}
          aria-label="Connect wallet"
        >
          <span className="wallet-pill-line">
            {connecting
              ? "Connecting..."
              : walletAddress
                ? shortenAddress(walletAddress)
                : "Connect Wallet"}
          </span>
          <small>
            {walletAddress ? `USDC Balance: ${usdcBalance}` : "Tap to connect"}
          </small>
        </button>
      </div>
    </header>
  );
}

export default Navbar;
