import { useState } from "react";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { approveUSDC } from "../contracts/wallet";

function CreateEscrow({
  escrowId,
  setEscrowId,
  setCurrentStep = () => {},
  onBlockchainUpdate = () => {},
}) {
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("");

  async function handleApproveUSDC() {
    if (!amount || Number(amount) <= 0) {
      alert("Enter a valid USDC amount");
      return;
    }

    const success = await approveUSDC(amount);

    if (success) {
      alert("USDC Approved Successfully!");
      setCurrentStep(2);
      onBlockchainUpdate();
    } else {
      alert("Approval Failed");
    }
  }

  const connectContract = async () => {
    if (!window.ethereum) {
      alert("Please install an EVM-compatible wallet");
      return null;
    }

    const provider = new BrowserProvider(window.ethereum);
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
        parseUnits(amount.toString(), 6)
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

  const submitWork = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const tx = await contract.submitWork(Number(escrowId));
      await tx.wait();

      alert("Work Submitted Successfully!");
      setCurrentStep(4);
      onBlockchainUpdate(escrowId);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const approveWork = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const tx = await contract.approveWork(Number(escrowId));
      await tx.wait();

      alert("Work Approved Successfully!");
      setCurrentStep(5);
      onBlockchainUpdate(escrowId);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const releaseFunds = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const tx = await contract.releaseFunds(Number(escrowId));
      await tx.wait();

      alert("Funds Released Successfully!");
      setCurrentStep(6);
      onBlockchainUpdate(escrowId);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  const depositFunds = async () => {
    try {
      const contract = await connectContract();
      if (!contract) return;

      const id = Number(escrowId);

      if (!id || Number.isNaN(id)) {
        alert("Enter a valid escrow ID");
        return;
      }

      const escrow = await contract.escrows(id);
      const wallet = await contract.runner.getAddress();

      if (!escrow.client || escrow.client.toLowerCase() !== wallet.toLowerCase()) {
        alert("Wrong Escrow ID selected.");
        return;
      }

      if (escrow.funded) {
        alert("This escrow is already funded.");
        return;
      }

      const tx = await contract.depositFunds(id);
      await tx.wait();

      alert("Funds Deposited Successfully!");
      setCurrentStep(3);
      onBlockchainUpdate(id);
    } catch (err) {
      console.error(err);
      alert(err.shortMessage || err.reason || err.message);
    }
  };

  return (
    <div className="card create-escrow-card">
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
