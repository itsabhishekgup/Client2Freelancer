import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { CONTRACT_ADDRESS } from "./config";
import { USDC_ADDRESS } from "./constants";
import { USDC_ABI } from "./USDCABI";
import { toast } from "../lib/toast";

export function resolveWalletProvider(providerSource) {
  return providerSource ?? (typeof window !== "undefined" ? window.ethereum : null);
}

export function getBrowserProvider(providerSource) {
  const source = resolveWalletProvider(providerSource);
  return source ? new BrowserProvider(source) : null;
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

    await tx.wait();

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
