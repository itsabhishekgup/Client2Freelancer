import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { USDC_ADDRESS } from "./constants";
import { USDC_ABI } from "./USDCABI";

export async function connectWallet() {
  if (!window.ethereum) {
    alert("Please install an EVM-compatible wallet");
    return null;
  }

  try {
    const provider = new BrowserProvider(window.ethereum);

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

export async function approveUSDC(amount) {
  try {
    const provider = new BrowserProvider(window.ethereum);

    const signer = await provider.getSigner();

    const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);

    const tx = await usdc.approve(
      "0x3Dd9f286dd70e6FD9d4EeFe642F8d7E71CD93291",
      parseUnits(amount.toString(), 6),
    );

    await tx.wait();

    console.log("Returning TRUE");

    return true;
  } catch (err) {
    console.error("APPROVE ERROR:", err);
    alert(err.message || JSON.stringify(err));
    return false;
  }
}
