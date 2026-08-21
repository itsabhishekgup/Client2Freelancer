import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";

import { USDC_ABI } from "../contracts/USDCABI";
import { USDC_ADDRESS } from "../contracts/constants";
import { ensureArcNetwork } from "../contracts/wallet";
import { useWalletBridge } from "../hooks/useWalletBridge";

const ARC_CHAIN_ID = 5042002;

const shortenAddress = (address) => {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

function Navbar({ onNavigate }) {
  const { address, isConnected, walletProvider, openConnect, openAccount } =
    useWalletBridge();
  const [usdcBalance, setUsdcBalance] = useState("--");
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [networkLabel, setNetworkLabel] = useState("Arc Testnet");
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [switching, setSwitching] = useState(false);

  const providerSource = useMemo(
    () => walletProvider ?? (typeof window !== "undefined" ? window.ethereum : null),
    [walletProvider],
  );

  const refreshWalletView = useCallback(async () => {
    if (!providerSource) {
      setUsdcBalance("--");
      setNetworkLabel("Arc Testnet");
      setWrongNetwork(false);
      setLoadingBalance(false);
      return;
    }

    try {
      setLoadingBalance(true);
      const provider = new BrowserProvider(providerSource);
      const network = await provider.getNetwork();
      const isArc = Number(network.chainId) === ARC_CHAIN_ID;

      setNetworkLabel(
        network?.name && network.name !== "unknown" ? network.name : "Arc Testnet",
      );
      setWrongNetwork(isConnected && !isArc);

      if (!address) {
        setUsdcBalance("--");
        return;
      }

      // USDC balanceOf is only meaningful on Arc (the USDC contract address is
      // Arc-specific). Reading it on Base/Sepolia returns 0 or reverts — show a
      // clear "switch network" hint instead of a misleading "--".
      if (!isArc) {
        setUsdcBalance("--");
        return;
      }

      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance = await usdc.balanceOf(address);
      setUsdcBalance(`${Number(formatUnits(balance, 6)).toFixed(2)} USDC`);
    } catch (error) {
      console.error("Navbar wallet refresh error:", error);
      setUsdcBalance("--");
    } finally {
      setLoadingBalance(false);
    }
  }, [address, providerSource, isConnected]);

  const handleSwitchToArc = async () => {
    if (!providerSource || switching) return;
    setSwitching(true);
    try {
      const net = await ensureArcNetwork(providerSource);
      if (!net.ok) {
        console.warn("network switch:", net.message);
      }
      // chainChanged listener re-runs refreshWalletView once the wallet flips.
    } catch (err) {
      console.error("network switch error:", err);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    refreshWalletView();
  }, [refreshWalletView]);

  useEffect(() => {
    if (!providerSource || typeof providerSource.on !== "function") return undefined;

    const handleAccountsChanged = () => refreshWalletView();
    const handleChainChanged = () => refreshWalletView();

    providerSource.on("accountsChanged", handleAccountsChanged);
    providerSource.on("chainChanged", handleChainChanged);

    return () => {
      providerSource.removeListener?.("accountsChanged", handleAccountsChanged);
      providerSource.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [providerSource, refreshWalletView]);

  const handleWalletClick = () => {
    if (isConnected) {
      openAccount();
      return;
    }

    openConnect();
  };

  return (
    <header className="top-navbar">
      <div className="nav-left">
        <div className="logo-section">
          <img src="/arc-logo.svg" alt="Arc logo" className="brand-image" />
          <div className="brand-copy">
            <h2>
              ArcBridge <span className="brand-suffix">Escrow</span>
            </h2>
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
          className={`wallet-pill ${isConnected ? "wallet-pill--connected" : ""}`}
          onClick={handleWalletClick}
          aria-label={isConnected ? "Open wallet account" : "Connect wallet"}
        >
          <span className="wallet-pill-line">
            {isConnected
              ? loadingBalance
                ? "Refreshing..."
                : shortenAddress(address)
              : "Connect Wallet"}
          </span>
          <small>
            {isConnected
              ? wrongNetwork
                ? `${networkLabel} • Not Arc`
                : `${networkLabel} • ${usdcBalance}`
              : "Tap to connect"}
          </small>
        </button>

        {wrongNetwork && (
          <button
            type="button"
            className="help-btn nav-switch-arc"
            onClick={handleSwitchToArc}
            disabled={switching}
          >
            {switching ? "Switching…" : "⇄ Switch to Arc"}
          </button>
        )}
      </div>
    </header>
  );
}

export default Navbar;
