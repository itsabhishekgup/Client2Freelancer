import { useState } from "react";
import { Contract, parseUnits } from "ethers";

import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { approveUSDC, getBrowserProvider } from "../contracts/wallet";
import { useWalletBridge } from "../hooks/useWalletBridge";

function CreateEscrow({
  escrowId,
  setEscrowId,
  setCurrentStep = () => {},
  onBlockchainUpdate = () => {},
}) {
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("");
  const { walletProvider, openConnect, isConnected } = useWalletBridge();

  async function handleApproveUSDC() {
    if (!amount || Number(amount) <= 0) {
      alert("Enter a valid USDC amount");
      return;
    }

    if (!getBrowserProvider(walletProvider)) {
      openConnect();
      return;
    }

    const success = await approveUSDC(amount, walletProvider);

    if (success) {
      alert("USDC Approved Successfully!");
      setCurrentStep(2);
      onBlockchainUpdate();
    } else {
      alert("Approval Failed");
    }
  }

  const connectContract = async () => {
    const provider = getBrowserProvider(walletProvider);

    if (!provider) {
      alert("Please connect a wallet first");
      openConnect();
      return null;
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);
  };

  const createEscrow = async () => {
    try {
      if (!freelancer || !amount || Number(amount) <= 0) {
        alert("Enter a valid freelancer address and amount");
        return;
      }

      const contract = await connectContract();
      if (!contract) return;

      const tx = await contract.createEscrow(
        freelancer.trim(),
        parseUnits(amount.toString(), 6),
      );

      const receipt = await tx.wait();

      const parsedEvent = receipt?.logs
        ?.map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event) => event?.name === "EscrowCreated");

      const newId = parsedEvent?.args?.escrowId?.toString();

      if (!newId) {
        alert("Escrow created, but event details were not found.");
        return;
      }

      setEscrowId(newId);
      setCurrentStep(1);
      onBlockchainUpdate(newId);
      alert(`Escrow Created! ID: ${newId}`);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const depositFunds = async () => {
    try {
      if (!getBrowserProvider(walletProvider)) {
        openConnect();
        return;
      }

      const escrowValue = escrowId?.toString?.() ?? String(escrowId ?? "").trim();
      const id = Number(escrowValue);

      if (!escrowValue || Number.isNaN(id) || id <= 0) {
        alert("Enter escrow ID first");
        return;
      }

      const provider = getBrowserProvider(walletProvider);
      if (!provider) {
        alert("Please connect a wallet first");
        openConnect();
        return;
      }

      const signer = await provider.getSigner();
      const wallet = await signer.getAddress();
      const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);

      const escrow = await contract.escrows(id);

      const client = escrow.client ?? escrow[0];
      const funded = escrow.funded ?? escrow[3];

      if (!client || client.toLowerCase() !== wallet.toLowerCase()) {
        alert("Wrong Escrow ID selected.");
        return;
      }

      if (funded) {
        alert("This escrow is already funded.");
        return;
      }

      const tx = await contract.depositFunds(id);
      await tx.wait();

      alert("Funds Deposited Successfully!");
      setCurrentStep(3);
      onBlockchainUpdate();
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const submitWork = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const escrowValue = escrowId?.toString?.() ?? String(escrowId ?? "").trim();
      if (!escrowValue) {
        alert("Enter escrow ID first");
        return;
      }

      const tx = await contract.submitWork(Number(escrowValue));
      await tx.wait();

      alert("Work Submitted Successfully!");
      setCurrentStep(4);
      onBlockchainUpdate();
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const approveWork = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const escrowValue = escrowId?.toString?.() ?? String(escrowId ?? "").trim();
      if (!escrowValue) {
        alert("Enter escrow ID first");
        return;
      }

      const tx = await contract.approveWork(Number(escrowValue));
      await tx.wait();

      alert("Work Approved Successfully!");
      setCurrentStep(5);
      onBlockchainUpdate();
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const releaseFunds = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const escrowValue = escrowId?.toString?.() ?? String(escrowId ?? "").trim();
      if (!escrowValue) {
        alert("Enter escrow ID first");
        return;
      }

      const tx = await contract.releaseFunds(Number(escrowValue));
      await tx.wait();

      alert("Funds Released Successfully!");
      setCurrentStep(6);
      onBlockchainUpdate();
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  return (
    <section className="card create-escrow-card">
      <div className="create-escrow-head">
        <div className="section-mark">✦</div>
        <div>
          <h2>Create New Escrow</h2>
          <p className="escrow-subtitle">
            Create a secure USDC escrow in just a few simple steps.
          </p>
        </div>
      </div>

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
        value={escrowId || ""}
        onChange={(e) => setEscrowId(e.target.value)}
      />

      <div className="action-grid premium-action-grid">
        <button type="button" onClick={createEscrow} className="premium-action-btn premium-action-btn--create">
          Create Escrow
        </button>
        <button type="button" onClick={handleApproveUSDC} className="premium-action-btn premium-action-btn--approve">
          Approve USDC
        </button>
        <button type="button" onClick={depositFunds} className="premium-action-btn premium-action-btn--deposit">
          Deposit Funds
        </button>
        <button type="button" onClick={submitWork} className="premium-action-btn premium-action-btn--submit">
          Submit Work
        </button>
        <button type="button" onClick={approveWork} className="premium-action-btn premium-action-btn--approve-work">
          Approve Work
        </button>
        <button type="button" onClick={releaseFunds} className="premium-action-btn premium-action-btn--release">
          Release Funds
        </button>
      </div>
    </section>
  );
}

export default CreateEscrow;
