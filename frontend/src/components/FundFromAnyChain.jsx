import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract } from "ethers";

import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { approveUSDC } from "../contracts/wallet";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { toast, updateToast } from "../lib/toast";

const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const ARC_EXPLORER = arcTestnet.blockExplorers?.default?.url ?? "";

const explorerLink = (txHash, base = ARC_EXPLORER) =>
  base && txHash ? `${base}/tx/${txHash}` : null;

// Source chains users can fund an escrow from (CCTP testnet pairs with Arc).
// USDC + gas on the source chain come from public testnet faucets.
const SOURCE_CHAINS = [
  {
    id: "base-sepolia",
    bridgeName: "Base_Sepolia",
    chainId: 84532,
    chainIdHex: "0x14a34",
    label: "Base Sepolia",
    icon: "🟦",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    native: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    faucet: "https://faucet.quicknode.com/base/base-sepolia",
  },
  {
    id: "eth-sepolia",
    bridgeName: "Ethereum_Sepolia",
    chainId: 11155111,
    chainIdHex: "0xaa36a7",
    label: "Ethereum Sepolia",
    icon: "⛓️",
    rpc: "https://rpc.sepolia.org",
    explorer: "https://sepolia.etherscan.io",
    native: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    faucet: "https://faucet.quicknode.com/ethereum/sepolia",
  },
];

// Stepper shown during the bridge. Steps 1-4 come from Bridge Kit's
// result.steps (real on-chain state); step 5 is the escrow deposit we run
// ourselves on Arc after the mint lands.
const INITIAL_STEPS = [
  { name: "Approve USDC", state: "pending" },
  { name: "Burn on source", state: "pending" },
  { name: "Attestation", state: "pending" },
  { name: "Mint on Arc", state: "pending" },
  { name: "Deposit into Escrow", state: "pending" },
];

async function requestChainSwitch(provider, chain) {
  const params = [{ chainId: chain.chainIdHex }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (err) {
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chain.chainIdHex,
            chainName: chain.label,
            rpcUrls: [chain.rpc],
            nativeCurrency: chain.native,
            blockExplorerUrls: [chain.explorer],
          },
        ],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params });
    } else {
      throw err;
    }
  }
}

function FundFromAnyChain({ escrowId = "", onBlockchainUpdate = () => {} }) {
  const { isConnected, walletProvider, openConnect } = useWalletBridge();
  const [sourceChain, setSourceChain] = useState(SOURCE_CHAINS[0]);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle"); // idle | switching | bridging | depositing | done | error
  const [pending, setPending] = useState(null);
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null); // { bridgeHashes, depositHash, amount }
  const kitEvents = useRef([]);

  const escrowValue = String(escrowId ?? "").trim();
  const escrowNum = Number(escrowValue);
  const hasId = Boolean(escrowValue && !Number.isNaN(escrowNum) && escrowNum > 0);

  // Reset per-escrow state when the ID changes.
  useEffect(() => {
    setStatus("idle");
    setError("");
    setReceipt(null);
    setSteps(INITIAL_STEPS);
    kitEvents.current = [];
  }, [escrowValue]);

  const runBridge = useCallback(async () => {
    if (pending) return;
    if (!isConnected || !walletProvider) {
      toast("Connect a wallet first to fund an escrow", "warning");
      openConnect();
      return;
    }
    if (!hasId) {
      toast("Enter an escrow ID first", "warning");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast("Enter a USDC amount to bridge", "warning");
      return;
    }

    setError("");
    setReceipt(null);
    setSteps(INITIAL_STEPS);
    kitEvents.current = [];
    setPending("switching");
    setStatus("switching");

    const pendingToastId = toast("Bridging USDC from " + sourceChain.label + "…", "pending", {
      duration: 0,
    });

    try {
      // 1) Point the wallet at the source chain.
      await requestChainSwitch(walletProvider, sourceChain);
      setStatus("bridging");
      setPending("bridging");

      // 2) Bridge Kit signs approve + burn on the source chain, waits for
      //    Circle's attestation, and mints USDC on Arc. No API key needed.
      const { BridgeKit } = await import("@circle-fin/bridge-kit");
      const { createEthersAdapterFromProvider } = await import(
        "@circle-fin/adapter-ethers-v6"
      );
      const adapter = await createEthersAdapterFromProvider({ provider: walletProvider });
      const kit = new BridgeKit();

      kit.on("*", (payload) => {
        kitEvents.current.push(payload);
        // Map Bridge Kit lifecycle events onto the visible stepper.
        const method = String(payload?.method ?? "").toLowerCase();
        if (method.includes("approve")) markStep(0, "pending");
        if (method.includes("burn")) markStep(1, "pending");
        if (method.includes("attestation") || method.includes("message")) markStep(2, "pending");
        if (method.includes("mint") || method.includes("receive")) markStep(3, "pending");
      });

      const result = await kit.bridge({
        from: { adapter, chain: sourceChain.bridgeName },
        to: { adapter, chain: "Arc_Testnet" },
        amount,
      });

      if (result?.state !== "success") {
        throw new Error("Bridge did not complete successfully");
      }

      // Mark bridge steps from the real result.steps (hashes + explorer links).
      if (Array.isArray(result.steps)) {
        setSteps((prev) =>
          result.steps.map((step, i) => ({
            name: prev[i]?.name ?? step.name,
            state: step.state === "success" ? "success" : "pending",
            txHash: step.txHash,
            explorerUrl: step.explorerUrl,
          })),
        );
      }
      const bridgeHashes = (result.steps ?? [])
        .filter((s) => s.txHash)
        .map((s) => ({ name: s.name, txHash: s.txHash, explorerUrl: s.explorerUrl }));

      // 3) Deposit the minted USDC into the escrow: switch to Arc, approve,
      //    then depositFunds. Same contract call as the manual flow.
      setStatus("depositing");
      setPending("depositing");
      await requestChainSwitch(walletProvider, {
        chainIdHex: "0x" + arcTestnet.id.toString(16),
        chainId: arcTestnet.id,
        label: arcTestnet.name,
        rpc: ARC_RPC_URL,
        explorer: ARC_EXPLORER,
        native: arcTestnet.nativeCurrency,
      });

      const approved = await approveUSDC(amount, walletProvider);
      if (!approved?.ok) {
        updateToast(pendingToastId, {
          message: approved?.message || "USDC approval on Arc failed",
          type: "warning",
          duration: 6000,
        });
        return;
      }

      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);
      const depositTx = await contract.depositFunds(escrowNum);
      const depositHash = depositTx.hash;
      await depositTx.wait();

      // Mark the deposit step done.
      setSteps((prev) =>
        prev.map((s, i) =>
          i === prev.length - 1 ? { ...s, state: "success" } : s,
        ),
      );

      setReceipt({ bridgeHashes, depositHash, amount, escrowId: escrowValue });
      setStatus("done");
      onBlockchainUpdate();
      updateToast(pendingToastId, {
        message: `Escrow #${escrowValue} funded from ${sourceChain.label}!`,
        type: "success",
        link: explorerLink(depositHash),
        duration: 9000,
      });
    } catch (err) {
      console.error("bridge error:", err);
      const message = err?.shortMessage || err?.reason || err?.message || "Bridge failed";
      setError(message);
      setStatus("error");
      updateToast(pendingToastId, { message, type: "error", duration: 9000 });
    } finally {
      setPending(null);
    }
  }, [isConnected, walletProvider, openConnect, hasId, escrowValue, escrowNum, amount, sourceChain, onBlockchainUpdate, pending]);

  const markStep = (index, state) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state } : s)));
  };

  const closeReceipt = () => {
    setReceipt(null);
    setStatus("idle");
  };

  return (
    <section className="card dashboard-section fund-card">
      <div className="summary-header">
        <div>
          <h3>🌉 Fund From Any Chain</h3>
          <p>Bridge USDC from another chain straight into your escrow — powered by Circle CCTP</p>
        </div>
        <span className="status-badge live">CCTP</span>
      </div>

      {status === "idle" && (
        <div className="fund-flow">
          <div className="fund-row">
            <div className="fund-field">
              <label>Escrow ID</label>
              <input
                type="number"
                placeholder="Escrow #"
                value={escrowValue}
                readOnly
                className="fund-input fund-input--readonly"
              />
            </div>
            <div className="fund-field">
              <label>Source chain</label>
              <div className="fund-chain-select">
                {SOURCE_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    type="button"
                    className={`fund-chain-option${sourceChain.id === chain.id ? " active" : ""}`}
                    onClick={() => setSourceChain(chain)}
                  >
                    <span aria-hidden="true">{chain.icon}</span> {chain.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fund-row">
            <div className="fund-field">
              <label>USDC amount to bridge</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="fund-input"
              />
            </div>
            <div className="fund-field fund-flow-note">
              <p>
                Need USDC + {sourceChain.native.symbol} on {sourceChain.label}? Get testnet funds
                from the{" "}
                <a href={sourceChain.faucet} target="_blank" rel="noopener noreferrer">
                  faucet ↗
                </a>
              </p>
            </div>
          </div>

          <button
            type="button"
            className="premium-action-btn premium-action-btn--create"
            onClick={runBridge}
            disabled={!hasId || !amount || Number(amount) <= 0}
          >
            🌉 Bridge &amp; Fund Escrow #{escrowValue || "…"}
          </button>
        </div>
      )}

      {(status === "switching" || status === "bridging" || status === "depositing") && (
        <div className="fund-stepper">
          <div className="fund-stepper-head">
            <span className="btn-spinner" aria-hidden="true" />
            <strong>
              {status === "switching"
                ? `Switching wallet to ${sourceChain.label}…`
                : status === "depositing"
                  ? "Depositing USDC into escrow on Arc…"
                  : `Bridging USDC from ${sourceChain.label} to Arc Testnet…`}
            </strong>
          </div>
          <p className="fund-stepper-sub">
            Approve → burn → attestation → mint on Arc, then deposit. ~30-60 seconds.
          </p>
          <div className="fund-steps">
            {steps.map((step, i) => (
              <div key={i} className={`fund-step fund-step--${step.state}`}>
                <span className="fund-step-icon" aria-hidden="true">
                  {step.state === "success" ? "✓" : step.state === "pending" ? "•" : "✕"}
                </span>
                <span className="fund-step-name">{step.name}</span>
                {step.txHash && step.explorerUrl ? (
                  <a
                    className="fund-step-link"
                    href={explorerLink(step.txHash, step.explorerUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    view ↗
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="fund-error">
          <strong>❌ Bridge failed</strong>
          <span>{error}</span>
          <p className="escrow-hint">
            Tip: make sure your wallet has USDC and {sourceChain.native.symbol} gas on{" "}
            {sourceChain.label}, then retry.
          </p>
          <button
            type="button"
            className="help-cta"
            onClick={() => {
              setStatus("idle");
              setError("");
            }}
          >
            ← Try again
          </button>
        </div>
      )}

      {status === "done" && receipt && (
        <div className="fund-receipt">
          <div className="fund-receipt-head">
            <strong>✅ Escrow Funded via CCTP</strong>
            <span>Escrow #{receipt.escrowId} · {receipt.amount} USDC</span>
          </div>
          <div className="safety-receipt-grid">
            <div className="summary-item">
              <span>From</span>
              <strong>{sourceChain.label}</strong>
            </div>
            <div className="summary-item">
              <span>To</span>
              <strong>Arc Testnet</strong>
            </div>
            {receipt.bridgeHashes.map((h, i) => (
              <div className="summary-item" key={`bh-${i}`}>
                <span>{h.name}</span>
                <strong>
                  <a
                    href={explorerLink(h.txHash, h.explorerUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {h.txHash.slice(0, 10)}…{h.txHash.slice(-6)} ↗
                  </a>
                </strong>
              </div>
            ))}
            <div className="summary-item">
              <span>Escrow deposit</span>
              <strong>
                <a
                  href={explorerLink(receipt.depositHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {receipt.depositHash.slice(0, 10)}…{receipt.depositHash.slice(-6)} ↗
                </a>
              </strong>
            </div>
          </div>
          <div className="fund-receipt-actions">
            <button type="button" className="help-cta" onClick={closeReceipt}>
              Done
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default FundFromAnyChain;
