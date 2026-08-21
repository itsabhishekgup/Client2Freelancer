import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { CONTRACT_ADDRESS } from "./config";
import { USDC_ADDRESS } from "./constants";
import { USDC_ABI } from "./USDCABI";
import { toast } from "../lib/toast";

const ARC_CHAIN_ID = 5042002;

// Wait for a tx receipt with a hard timeout. A stuck pending tx (RPC stalls,
// wallet disconnected mid-flow) otherwise leaves the caller's pending toast and
// disabled buttons stuck forever. On timeout the tx is still on-chain/pending —
// the caller surfaces a "still pending, check the explorer" message instead of
// pretending it failed.
export async function waitForTx(tx, { timeoutMs = 120000 } = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("Transaction is taking longer than expected — it may still be pending. Check the explorer for the latest status.")),
      timeoutMs,
    );
    timer.unref?.();
  });

  try {
    // tx.wait() polls for the receipt itself; racing it with a timeout is the
    // only thing we add — a stuck pending tx can otherwise hang forever.
    return await Promise.race([tx.wait(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function resolveWalletProvider(providerSource) {
  return providerSource ?? (typeof window !== "undefined" ? window.ethereum : null);
}

export function getBrowserProvider(providerSource) {
  const source = resolveWalletProvider(providerSource);
  return source ? new BrowserProvider(source) : null;
}

/**
 * Verify the connected wallet is on Arc (chain 5042002) before a signed
 * transaction. Returns { ok: true } when on the right network, otherwise an
 * error message (and attempts a wallet switch). Prevents silently submitting
 * escrow txs on the wrong chain (e.g. after the CCTP bridge leaves the wallet
 * on Base/Ethereum Sepolia).
 */
export async function ensureArcNetwork(providerSource) {
  const provider = getBrowserProvider(providerSource);
  if (!provider) return { ok: false, message: "Please connect a wallet first" };

  try {
    const network = await provider.getNetwork();
    if (Number(network.chainId) === ARC_CHAIN_ID) return { ok: true };

    const rawProvider = resolveWalletProvider(providerSource);
    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + ARC_CHAIN_ID.toString(16) }],
      });
    } catch (switchErr) {
      if (switchErr?.code === 4902) {
        await rawProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x" + ARC_CHAIN_ID.toString(16),
              chainName: "Arc Testnet",
              rpcUrls: ["https://rpc.testnet.arc.network"],
              nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
              blockExplorerUrls: ["https://testnet.arcscan.app"],
            },
          ],
        });
        await rawProvider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + ARC_CHAIN_ID.toString(16) }],
        });
      } else {
        throw switchErr;
      }
    }

    return {
      ok: false,
      message: "Switch your wallet to Arc Network (Chain ID 5042002) and try again.",
    };
  } catch (err) {
    console.error("network check error:", err);
    return {
      ok: false,
      message:
        err?.shortMessage || err?.reason || err?.message || "Wrong network — please switch to Arc Network (5042002).",
    };
  }
}

export async function readWalletSnapshot(providerSource, connectedAddress = null) {
  const provider = getBrowserProvider(providerSource);

  if (!provider) {
    return {
      connected: false,
      address: "--",
      balance: "--",
      network: "Arc Testnet",
      loading: false,
    };
  }

  const network = await provider.getNetwork();
  const accounts = await provider.send("eth_accounts", []);
  const address = connectedAddress ?? accounts?.[0] ?? null;
  const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);

  let balance = "--";
  if (address) {
    const raw = await usdc.balanceOf(address);
    balance = `${Number(formatUnits(raw, 6)).toFixed(2)} USDC`;
  }

  return {
    connected: Boolean(address),
    address: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "--",
    balance,
    network: network?.name && network.name !== "unknown" ? network.name : "Arc Testnet",
    loading: false,
  };
}

export async function connectWallet(providerSource) {
  const provider = getBrowserProvider(providerSource);

  if (!provider) {
    toast("Please install an EVM-compatible wallet", "warning");
    return null;
  }

  try {
    await provider.send("eth_requestAccounts", []);

    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
    const balance = await usdc.balanceOf(address);
    const formattedBalance = formatUnits(balance, 6);

    return {
      provider,
      signer,
      address,
      usdcBalance: formattedBalance,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getUSDCAllowance(ownerAddress, providerSource) {
  const provider = getBrowserProvider(providerSource);
  if (!provider || !ownerAddress) return null;
  try {
    const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
    const allowance = await usdc.allowance(ownerAddress, CONTRACT_ADDRESS);
    return allowance;
  } catch (err) {
    console.error("allowance read error:", err);
    return null;
  }
}

export async function getUSDCBalance(address, providerSource) {
  const provider = getBrowserProvider(providerSource);
  if (!provider || !address) return null;
  try {
    const usdc = new Contract(USDC_ADDRESS, USDC_ABI, provider);
    return await usdc.balanceOf(address);
  } catch (err) {
    console.error("balance read error:", err);
    return null;
  }
}

export async function approveUSDC(amount, providerSource) {
  const provider = getBrowserProvider(providerSource);

  if (!provider) {
    return { ok: false, hash: null, message: "Please connect a wallet first" };
  }

  try {
    const signer = await provider.getSigner();
    const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);

    const tx = await usdc.approve(
      CONTRACT_ADDRESS,
      parseUnits(amount.toString(), 6),
    );
    const txHash = tx.hash;

    await waitForTx(tx);

    return { ok: true, hash: txHash, message: null };
  } catch (err) {
    console.error("APPROVE ERROR:", err);
    return {
      ok: false,
      hash: null,
      message: err?.shortMessage || err?.reason || err?.message || JSON.stringify(err),
    };
  }
}
