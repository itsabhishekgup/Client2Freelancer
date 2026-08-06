import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import { USDC_ABI } from "../contracts/USDCABI";
import { USDC_ADDRESS } from "../contracts/constants";

const shortenAddress = (address) => {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

function WalletCard() {
  const [walletAddress, setWalletAddress] = useState("");
  const [usdcBalance, setUsdcBalance] = useState("--");
  const [networkName, setNetworkName] = useState("Arc Testnet");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadWalletData = useCallback(async () => {
    if (!window.ethereum) {
      setConnected(false);
      setWalletAddress("");
      setUsdcBalance("--");
      setNetworkName("Arc Testnet");
      return;
    }

    try {
      setLoading(true);

      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_accounts", []);

      if (!accounts || accounts.length === 0) {
        setConnected(false);
        setWalletAddress("");
        setUsdcBalance("--");
        setNetworkName("Arc Testnet");
        return;
      }

      const address = accounts[0];
      const network = await provider.getNetwork();
      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance = await usdc.balanceOf(address);

      setConnected(true);
      setWalletAddress(address);
      setUsdcBalance(Number(formatUnits(balance, 6)).toFixed(2));
      setNetworkName(network?.name && network.name !== "unknown" ? network.name : "Arc Testnet");
    } catch (error) {
      console.error("WalletCard load error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWalletData();

    if (!window.ethereum) return undefined;

    const handleAccountsChanged = () => loadWalletData();
    const handleChainChanged = () => loadWalletData();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [loadWalletData]);

  return (
    <div className="card wallet-card">
      <div className="wallet-header">
        <div>
          <h3>Wallet Overview</h3>
          <p>Your connected wallet status</p>
        </div>

        <span className={`wallet-badge ${connected ? "connected" : "disconnected"}`}>
          <span className="status-dot" />
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="wallet-info">
        <div className="wallet-item">
          <span>Network</span>
          <strong>{networkName}</strong>
        </div>

        <div className="wallet-item">
          <span>USDC Balance</span>
          <strong>{loading ? "Loading..." : `${usdcBalance} USDC`}</strong>
        </div>

        <div className="wallet-item">
          <span>Wallet Status</span>
          <strong>{connected ? "Active" : "Inactive"}</strong>
        </div>

        <div className="wallet-item">
          <span>Address</span>
          <strong>{walletAddress ? shortenAddress(walletAddress) : "--"}</strong>
        </div>
      </div>
    </div>
  );
}

export default WalletCard;
