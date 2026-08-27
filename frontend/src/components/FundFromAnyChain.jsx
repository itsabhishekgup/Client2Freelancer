import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, Contract, FallbackProvider, JsonRpcProvider, formatUnits, parseUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { approveUSDC, ensureArcNetwork, waitForTx } from "../contracts/wallet";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { toast, updateToast } from "../lib/toast";

const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const ARC_EXPLORER = arcTestnet.blockExplorers?.default?.url ?? "";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const readContract = new Contract(
  CONTRACT_ADDRESS,
  escrowArtifact.abi,
  new JsonRpcProvider(ARC_RPC_URL),
);

// Read-only escrow lookup for pre-bridge validation: verifies the escrow
// exists, belongs to the connected wallet, and is still unfunded before the
// user burns USDC on the source chain. Returns { found: false } for a missing
// escrow, { error: message } for an RPC failure (so we don't tell the user
// "escrow doesn't exist" when the chain just didn't answer).
async function fetchEscrowValidation(escrowNum, walletAddress) {
  try {
    const raw = await readContract.escrows(escrowNum);
    const client = raw?.[0];
    const amountWei = raw?.[2];
    const funded = Boolean(raw?.[3]);
    if (!client || String(client).toLowerCase() === ZERO_ADDRESS) return { found: false };
    return {
      found: true,
      client: String(client).toLowerCase(),
      amountWei: amountWei ? BigInt(amountWei.toString()) : 0n,
      funded,
      isClient: String(client).toLowerCase() === String(walletAddress).toLowerCase(),
    };
  } catch {
    return { error: "Could not read escrow state from the chain. Try again in a moment." };
  }
}

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
    // Primary RPC order matters: sepolia.base.org returns "missing revert
    // data" on allowance/balanceOf eth_call simulations (broken for reads),
    // which failed the Bridge Kit pre-flight. publicnode + drpc serve reads
    // reliably — they go first, sepolia.base.org stays as a last resort.
    rpc: "https://base-sepolia-rpc.publicnode.com",
    rpcFallbacks: [
      "https://base-sepolia.drpc.org",
      "https://sepolia.base.org",
    ],
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
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    rpcFallbacks: [
      "https://rpc.sepolia.org",
    ],
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

  // The switch request resolving does NOT mean the provider is serving the new
  // chain yet — some wallets take a moment to flip their active chain. Poll
  // eth_chainId until it matches (short timeout) so the transactions Bridge Kit
  // signs afterwards are sent on the intended chain, not the previous one.
  const target = Number(chain.chainId);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const id = await provider.request({ method: "eth_chainId", params: [] });
      if (Number(id) === target) return;
    } catch {
      // wallet may be mid-switch; keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Wallet did not switch to ${chain.label} (expected chain ID ${target}). Please switch manually and try again.`,
  );
}

// Retry wrapper around JsonRpcProvider for the Bridge Kit adapter's read-only
// pre-flight calls (balanceOf / allowance / estimates). The public testnet RPCs
// rate-limit bursts (HTTP 429) and can stall with timeouts — both surface to the
// user as "Read contract failed: missing revert data" or "Network connection
// failed for <chain>". Retrying transient failures (with backoff) makes those
// reads reliable. staticNetwork keeps detection off so the adapter's immediate
// first call never races provider startup.
class RetryJsonRpcProvider extends JsonRpcProvider {
  async send(method, params) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await super.send(method, params);
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message ?? e).toLowerCase();
        const transient =
          msg.includes("rate limit") ||
          msg.includes("429") ||
          msg.includes("timeout") ||
          msg.includes("network changed") ||
          msg.includes("missing revert data") ||
          msg.includes("could not coalesce") ||
          msg.includes("fetch failed") ||
          msg.includes("econnrefused") ||
          msg.includes("enotfound") ||
          msg.includes("internal json-rpc") ||
          msg.includes("-32000") ||
          msg.includes("-32603");
        if (!transient || attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    throw lastErr;
  }
}

function FundFromAnyChain({ escrowId = "", onBlockchainUpdate = () => {} }) {
  const { isConnected, address: connectedAddress, walletProvider, openConnect } = useWalletBridge();
  const [sourceChain, setSourceChain] = useState(SOURCE_CHAINS[0]);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("idle"); // idle | switching | bridging | depositing | done | error
  const [pending, setPending] = useState(null);
  const [retryable, setRetryable] = useState(false); // soft bridge failure — retry offered
  const [steps, setSteps] = useState(INITIAL_STEPS);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null); // { bridgeHashes, depositHash, amount }
  const [mintedPendingDeposit, setMintedPendingDeposit] = useState(false); // USDC minted on Arc but deposit not done yet
  const kitEvents = useRef([]);
  const bridgeContextRef = useRef(null); // { kit, adapter } kept for retry
  const lastResultRef = useRef(null); // last BridgeResult, for retry
  const autoRetried = useRef(false); // one automatic mint-step retry per run

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
    bridgeContextRef.current = null;
    lastResultRef.current = null;
    autoRetried.current = false;
    setRetryable(false);
    setMintedPendingDeposit(false);
  }, [escrowValue]);

  const markStep = useCallback((index, state) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state } : s)));
  }, []);

  // Shared deposit step (used by runBridge and retryBridge): switch the wallet
  // to Arc, approve USDC, depositFunds into the escrow, then mark everything
  // done. Throws on failure so the caller's catch handles the toast.
  const runDepositFlow = useCallback(
    async (pendingToastId, bridgeHashes) => {
      setStatus("depositing");
      setPending("depositing");
      // The USDC is already minted on Arc at this point — if any later step
      // fails, surface that explicitly instead of just "Bridge failed".
      setMintedPendingDeposit(true);
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
        // Reset the flow so the stepper does not stay stuck on "depositing".
        setStatus("error");
        setError(approved?.message || "USDC approval on Arc failed");
        return false;
      }

      const net = await ensureArcNetwork(walletProvider);
      if (!net.ok) {
        updateToast(pendingToastId, { message: net.message, type: "warning", duration: 6000 });
        setStatus("error");
        setError(net.message);
        return false;
      }

      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);
      const depositTx = await contract.depositFunds(escrowNum);
      const depositHash = depositTx.hash;
      await waitForTx(depositTx);

      // Mark the deposit step done.
      setSteps((prev) =>
        prev.map((s, i) => (i === prev.length - 1 ? { ...s, state: "success" } : s)),
      );

      setReceipt({ bridgeHashes, depositHash, amount, escrowId: escrowValue });
      setStatus("done");
      setRetryable(false);
      setMintedPendingDeposit(false);
      onBlockchainUpdate();
      updateToast(pendingToastId, {
        message: `Escrow #${escrowValue} funded from ${sourceChain.label}!`,
        type: "success",
        link: explorerLink(depositHash),
        duration: 9000,
      });
      return true;
    },
    [walletProvider, amount, escrowNum, escrowValue, sourceChain, onBlockchainUpdate],
  );

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

    // Pre-bridge validation: the escrow must exist, be unfunded, belong to the
    // connected wallet, and the bridged amount must match the escrow amount —
    // otherwise the deposit step after bridging would revert and the user's
    // USDC would sit un-deposited on Arc. Catch these BEFORE any source-chain
    // burn happens.
    const escrowCheck = await fetchEscrowValidation(escrowNum, connectedAddress ?? "");
    if (escrowCheck.error) {
      toast(escrowCheck.error, "warning");
      return;
    }
    if (!escrowCheck.found) {
      toast(`Escrow #${escrowValue} does not exist on-chain`, "error");
      return;
    }
    if (!escrowCheck.isClient) {
      toast("Only the escrow's client can fund it", "warning");
      return;
    }
    if (escrowCheck.funded) {
      toast(`Escrow #${escrowValue} is already funded`, "warning");
      return;
    }
    // The bridged amount must cover the escrow amount. Compare in wei units
    // (BigInt math) instead of Number() so large amounts never lose precision.
    // Extra USDC is fine — it covers the Arc relayer fee (deducted from the
    // mint when useForwarder is on) and leaves a small USDC gas buffer in the
    // wallet for the deposit tx (Arc's native gas is USDC). depositFunds pulls
    // exactly escrow.amount, so the surplus stays in the wallet.
    const amountWei = parseUnits(amount.toString(), 6);
    const escrowAmountWei = escrowCheck.amountWei;
    if (amountWei < escrowAmountWei - 1n) {
      const escrowAmountUsdc = Number(formatUnits(escrowAmountWei, 6));
      toast(
        `Amount is too low — escrow #${escrowValue} needs ${escrowAmountUsdc.toFixed(2)} USDC. Bridge at least that much (a little extra covers gas + relay fee).`,
        "warning",
      );
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
      // Use a public RPC for the adapter's read-only pre-flight checks
      // (balanceOf / allowance). Without this, those reads go through the
      // browser wallet provider, which is still on the chain the wallet was
      // last on (e.g. Arc) — so a Base Sepolia USDC balanceOf call hits the
      // wrong chain's RPC and fails with "missing revert data". Transactions
      // are still signed by the user's wallet (signer comes from the provider).
      //
      // staticNetwork is set because the adapter calls staticCall immediately
      // after creating the provider — async network detection can race that
      // first call and surface as "missing revert data" / "failed to detect
      // network". We already know the chain (from the Bridge Kit definition),
      // so skipping detection is safe and makes reads synchronous-fast.
      const adapter = await createEthersAdapterFromProvider({
        provider: walletProvider,
        getProvider: ({ chain }) => {
          // Build a read-only multi-RPC provider for the adapter's pre-flight
          // checks (balanceOf / allowance / estimates). The default public
          // testnet RPCs (e.g. sepolia.base.org) return "missing revert data"
          // on eth_call simulations, which fails the approve/burn pre-flight.
          // So we use OUR configured RPC order for the source chain (reliable
          // endpoints first), wrap every endpoint in the retry provider, and
          // combine them with a FallbackProvider at quorum 1 (first successful
          // answer wins). One flaky RPC can no longer fail the whole bridge.
          const chainId = Number(chain.chainId);
          const configured =
            chainId === sourceChain.chainId
              ? [sourceChain.rpc, ...sourceChain.rpcFallbacks]
              : null;
          const rpcUrls =
            configured ??
            (chain?.rpcEndpoints?.length
              ? [...chain.rpcEndpoints]
              : chain?.rpcUrls?.default?.http ?? []);
          if (!rpcUrls.length) return null;

          const opts = { staticNetwork: true, pollingInterval: 4000 };
          const retryProviders = rpcUrls.map(
            (url) => new RetryJsonRpcProvider(url, chainId, opts),
          );
          if (retryProviders.length === 1) return retryProviders[0];
          // quorum 1: return the first successful result instead of waiting
          // for a majority — ideal for read-only pre-flight calls.
          return new FallbackProvider(retryProviders, chainId, { quorum: 1 });
        },
      });
      const kit = new BridgeKit();
      bridgeContextRef.current = { kit, adapter };

      kit.on("*", (payload) => {
        kitEvents.current.push(payload);
        // Bridge Kit emits an event when an action completes (payload.values
        // carries the tx hash for that step), so mark the matching step as
        // done instead of leaving it stuck on "pending".
        const method = String(payload?.method ?? "").toLowerCase();
        const txHash = payload?.values?.txHash;
        const eventState = String(payload?.state ?? "").toLowerCase();
        const failed = eventState === "error" || eventState === "failed";
        if (method.includes("approve")) markStep(0, failed ? "error" : txHash ? "success" : "pending");
        if (method.includes("burn")) markStep(1, failed ? "error" : txHash ? "success" : "pending");
        if (method.includes("attestation") || method.includes("message")) markStep(2, failed ? "error" : "success");
        if (method.includes("mint") || method.includes("receive")) markStep(3, failed ? "error" : txHash ? "success" : "pending");
      });

      let result = await kit.bridge({
        from: { adapter, chain: sourceChain.bridgeName },
        to: { adapter, chain: "Arc_Testnet", useForwarder: true },
        amount,
      });
      lastResultRef.current = result;

      // Auto-retry soft failures once: the public Arc RPC is rate-limited and
      // the mint step can transiently fail with "Network connection failed for
      // Arc Testnet" (a 429/timeout surfaced by the adapter). Bridge Kit's
      // retry resumes from the last successful step — burn/attestation are
      // already done at that point, so this is cheap and safe.
      if (
        result?.state === "error" &&
        !autoRetried.current &&
        (result.steps ?? []).some((s) => s.name === "mint" || s.name === "fetchAttestation")
      ) {
        autoRetried.current = true;
        setSteps((prev) =>
          prev.map((s, i) =>
            i === 3 ? { ...s, state: "pending" } : i === 2 ? { ...s, state: "success" } : s,
          ),
        );
        try {
          const retried = await kit.retry(result, { from: adapter, to: adapter });
          lastResultRef.current = retried;
          if (retried?.state === "success") result = retried;
        } catch (retryErr) {
          console.warn("auto-retry mint failed, surfacing original error:", retryErr);
        }
      }

      if (result?.state === "error") {
        const failedStep = (result.steps ?? []).find((s) => s.state === "error");
        // Soft failures (network/gas/attestation) can be retried with
        // kit.retry — keep the result around and surface a retry-able error.
        const err = new Error(
          failedStep?.errorMessage ||
            failedStep?.name ||
            "Bridge did not complete successfully",
        );
        err.retryable = true;
        throw err;
      }
      if (result?.state !== "success") {
        throw new Error("Bridge did not complete successfully");
      }

      // Mark bridge steps from the real result.steps (hashes + explorer links).
      // Bridge Kit returns 4 steps (approve, depositForBurn, fetchAttestation,
      // mint) but our stepper has 5 (the last is the escrow deposit we run
      // ourselves). Merge by NAME instead of index so the 5-step layout (incl.
      // "Deposit into Escrow") is preserved no matter how many steps the kit
      // reports. Preserve error/noop states: success → success, error → error,
      // noop → success (nothing was needed, so the step is effectively done).
      setSteps((prev) =>
        prev.map((uiStep, i) => {
          if (i >= (result.steps ?? []).length) return uiStep; // keep our own step 5
          const kitStep = result.steps[i];
          return {
            name: uiStep.name ?? kitStep.name,
            state:
              kitStep.state === "success" || kitStep.state === "noop"
                ? "success"
                : kitStep.state,
            txHash: kitStep.txHash,
            explorerUrl: kitStep.explorerUrl,
            errorMessage: kitStep.errorMessage,
          };
        }),
      );
      const bridgeHashes = (result.steps ?? [])
        .filter((s) => s.txHash)
        .map((s) => ({ name: s.name, txHash: s.txHash, explorerUrl: s.explorerUrl }));

      // 3) Deposit the minted USDC into the escrow: switch to Arc, approve,
      //    then depositFunds. Same contract call as the manual flow.
      await runDepositFlow(pendingToastId, bridgeHashes);
    } catch (err) {
      console.error("bridge error:", err);
      const message = err?.shortMessage || err?.reason || err?.message || "Bridge failed";
      setError(message);
      setStatus("error");
      setRetryable(Boolean(err?.retryable));
      updateToast(pendingToastId, { message, type: "error", duration: 9000 });
    } finally {
      setPending(null);
    }
  }, [isConnected, walletProvider, openConnect, hasId, escrowValue, escrowNum, amount, sourceChain, pending, connectedAddress, runDepositFlow, markStep]);

  // Resume a failed/incomplete bridge via BridgeKit.retry (soft failures only:
  // network timeouts, gas repricing, attestation delays). Restarts from the
  // last successful step instead of burning funds again.
  const retryBridge = useCallback(async () => {
    const ctx = bridgeContextRef.current;
    const result = lastResultRef.current;
    if (!ctx || !result || !retryable || pending) return;

    setError("");
    setRetryable(false);
    setPending("bridging");
    setStatus("bridging");
    const pendingToastId = toast("Retrying bridge from last step…", "pending", { duration: 0 });

    try {
      const retried = await ctx.kit.retry(result, { from: ctx.adapter, to: ctx.adapter });
      lastResultRef.current = retried;
      if (retried?.state === "error") {
        const failedStep = (retried.steps ?? []).find((s) => s.state === "error");
        throw new Error(
          failedStep?.errorMessage || failedStep?.name || "Retry did not complete successfully",
        );
      }
      if (retried?.state !== "success") {
        throw new Error("Retry did not complete successfully");
      }
      // Success — resume the normal deposit flow with the retried result.
      await runDepositFlow(pendingToastId, (retried.steps ?? []).filter((s) => s.txHash).map((s) => ({ name: s.name, txHash: s.txHash, explorerUrl: s.explorerUrl })));
    } catch (err) {
      console.error("retry bridge error:", err);
      const message = err?.shortMessage || err?.reason || err?.message || "Retry failed";
      setError(message);
      setStatus("error");
      setRetryable(true);
      updateToast(pendingToastId, { message, type: "error", duration: 9000 });
    } finally {
      setPending(null);
    }
  }, [retryable, pending, runDepositFlow]);

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
                <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">
                  faucet ↗
                </a>
              </p>
              <p className="escrow-hint">
                Bridge at least the escrow amount — a little extra covers the Arc relay fee + gas
                (Arc uses USDC for gas).
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
                  {step.state === "success" ? "✓" : step.state === "error" ? "✕" : "•"}
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
                {step.state === "error" && step.errorMessage ? (
                  <span className="fund-step-error">{step.errorMessage}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="fund-error">
          <strong>❌ {mintedPendingDeposit ? "Deposit incomplete" : "Bridge failed"}</strong>
          <span>{error}</span>
          {mintedPendingDeposit ? (
            <p className="escrow-hint">
              Your USDC was minted on Arc and is sitting in your wallet — the escrow deposit
              didn't go through. You can deposit it now (no need to bridge again).
            </p>
          ) : (
            <p className="escrow-hint">
              Tip: make sure your wallet has USDC and {sourceChain.native.symbol} gas on{" "}
              {sourceChain.label}, then retry.
            </p>
          )}
          {mintedPendingDeposit && (
            <button
              type="button"
              className="premium-action-btn premium-action-btn--create"
              onClick={async () => {
                setError("");
                setStatus("depositing");
                setPending("depositing");
                const pendingToastId = toast("Depositing USDC into escrow on Arc…", "pending", {
                  duration: 0,
                });
                try {
                  await runDepositFlow(pendingToastId, lastResultRef.current
                    ? (lastResultRef.current.steps ?? []).filter((s) => s.txHash).map((s) => ({ name: s.name, txHash: s.txHash, explorerUrl: s.explorerUrl }))
                    : []);
                } catch (depositErr) {
                  console.error("deposit resume error:", depositErr);
                  const msg = depositErr?.shortMessage || depositErr?.reason || depositErr?.message || "Deposit failed";
                  setError(msg);
                  setStatus("error");
                  updateToast(pendingToastId, { message: msg, type: "error", duration: 9000 });
                } finally {
                  setPending(null);
                }
              }}
              disabled={pending !== null}
            >
              ↓ Deposit now (USDC is on Arc)
            </button>
          )}
          {retryable && (
            <button
              type="button"
              className="premium-action-btn premium-action-btn--approve"
              onClick={retryBridge}
              disabled={pending !== null}
            >
              ↻ Retry bridge from last step
            </button>
          )}
          <button
            type="button"
            className="help-cta"
            onClick={() => {
              setStatus("idle");
              setError("");
              setRetryable(false);
              setMintedPendingDeposit(false);
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
