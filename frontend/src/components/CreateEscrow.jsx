import { useState } from "react";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { USDC_ABI } from "../contracts/USDCABI";
import { approveUSDC } from "../contracts/wallet";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

function CreateEscrow({ escrowId, setEscrowId, setCurrentStep }) {
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("");

  async function handleApproveUSDC() {
    if (!amount || Number(amount) <= 0) {
      alert("Enter a valid USDC amount");
      return;
    }

    const success = await approveUSDC(amount);

    console.log("ApproveUSDC returned:", success);

    if (success) {
      alert("USDC Approved Successfully!");
      setCurrentStep(2);
    } else {
      alert("Approval Failed");
    }
  }

  const connectContract = async () => {
    const provider = new BrowserProvider(window.ethereum);

    const signer = await provider.getSigner();

    const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);

    console.log(await contract.runner.provider.getNetwork());
    console.log(await contract.getAddress());

    return contract;
  };

  const createEscrow = async () => {
    const contract = await connectContract();
    console.log("Freelancer:", freelancer);
    console.log("Amount:", amount);
    const tx = await contract.createEscrow(freelancer, parseUnits(amount, 6));

    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log) => log.fragment?.name === "EscrowCreated",
    );

    if (!event || !event.args) {
      alert("Escrow created, but event details were not found.");
      return;
    }

    const newId = event.args.escrowId.toString();

    setEscrowId(newId);

    alert(`Escrow Created! ID: ${newId}`);
    setCurrentStep(1);
  };

  const submitWork = async () => {
    try {
      const contract = await connectContract();

      const tx = await contract.submitWork(Number(escrowId));

      console.log("Submitting Work...");
      await tx.wait();

      alert("Work Submitted Successfully!");
      setCurrentStep(4);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const approveWork = async () => {
    try {
      const contract = await connectContract();

      const tx = await contract.approveWork(Number(escrowId));

      console.log("Approving Work...");
      await tx.wait();

      alert("Work Approved Successfully!");
      setCurrentStep(5);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const releaseFunds = async () => {
    try {
      const contract = await connectContract();

      const tx = await contract.releaseFunds(Number(escrowId));

      console.log("Releasing Funds...");
      await tx.wait();

      alert("Funds Released Successfully!");
      setCurrentStep(6);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const depositFunds = async () => {
    try {
      const contract = await connectContract();

      const id = Number(escrowId);

      console.log("Escrow ID:", id);

      const escrow = await contract.escrows(id);
      console.log("Escrow:", escrow);
      const wallet = await contract.runner.getAddress();

      if (escrow.client.toLowerCase() !== wallet.toLowerCase()) {
        alert("Wrong Escrow ID selected.");
        return;
      }
      if (escrow.funded) {
        alert("This escrow is already funded.");
        return;
      }

      console.log("Client:", escrow.client);
      console.log("Current Wallet:", await contract.runner.getAddress());

      const usdc = new Contract(USDC_ADDRESS, USDC_ABI, contract.runner);

      const allowance = await usdc.allowance(wallet, CONTRACT_ADDRESS);
      const balance = await usdc.balanceOf(wallet);

      console.log("Allowance =", allowance.toString());
      console.log("Balance =", balance.toString());
      console.log("Escrow Amount =", escrow.amount.toString());

      const tx = await contract.depositFunds(id);

      console.log("Waiting for confirmation...");
      await tx.wait();

      alert("Funds Deposited Successfully!");
      setCurrentStep(3);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  return (
    <div className="card create-escrow-card">
      <h2>🚀 Create New Escrow</h2>

      <p className="escrow-subtitle">
        Create a secure USDC escrow in just a few simple steps.
      </p>

      <input
        type="text"
        placeholder="Freelancer Wallet Address"
        value={freelancer}
        onChange={(e) => setFreelancer(e.target.value)}
      />

      <input
        type="number"
        placeholder="USDC Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <input
        type="text"
        placeholder="Escrow ID"
        value={escrowId}
        onChange={(e) => setEscrowId(e.target.value)}
      />

      <div className="action-grid">
        <button onClick={createEscrow}>Create Escrow</button>

        <button onClick={handleApproveUSDC}>Approve USDC</button>

        <button onClick={depositFunds}>Deposit Funds</button>

        <button onClick={submitWork}>Submit Work</button>

        <button onClick={approveWork}>Approve Work</button>

        <button onClick={releaseFunds}>Release Funds</button>
      </div>
    </div>
  );
}

export default CreateEscrow;
