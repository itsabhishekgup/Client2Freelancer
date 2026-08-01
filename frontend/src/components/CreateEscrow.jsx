import { useState } from "react";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { USDC_ABI } from "../contracts/USDCABI";

const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

function CreateEscrow() { 

    const [freelancer, setFreelancer] = useState("");
    const [amount, setAmount] = useState("");
    const [escrowId, setEscrowId] = useState("");

    
    const connectContract = async () => {
    const provider = new BrowserProvider(window.ethereum);

    const signer = await provider.getSigner();

    const contract = new Contract(

      CONTRACT_ADDRESS,
    escrowArtifact.abi,
    signer
    );
    
    console.log(await
    contract.runner.provider.getNetwork());
    console.log(await
    contract.getAddress());

    return contract;
  };

    const approveUSDC = async () => {
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const usdc = new Contract(
      USDC_ADDRESS,
      USDC_ABI,
      signer
    );

    const tx = await usdc.approve(
      CONTRACT_ADDRESS,
      parseUnits(amount, 6)
    );

    await tx.wait();

    alert("USDC Approved Successfully!");
  };
   
  const createEscrow = async () => {
  const contract = await connectContract();

  const tx = await contract.createEscrow(
    freelancer,
    parseUnits(amount, 6)
  );

  await tx.wait();

  alert("Escrow Created Successfully!");

  };
  
  const depositFunds = async () => {
   try {
    const contract = await connectContract();

    const id = Number(escrowId);

    console.log("Escrow ID:", id);

    const escrow = await contract.escrows(id);
    console.log("Escrow:", escrow);

    const tx = await contract.depositFunds(id);

    console.log("Waiting for confirmation...");
    await tx.wait();

    alert("Funds Deposited Successfully!");

    } catch (err) {
    console.error(err);
    alert(err.shortMessage || err.reason || err.message);
    }
  };

  return (
    <div className="card">
      <h2>Create Escrow</h2>

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

      <button onClick={createEscrow}>
        Create Escrow
      </button>

      <button onClick={approveUSDC}>
        Approve USDC
      </button>

      <button onClick={depositFunds}>
        Deposit Funds
      </button>

    </div>
  );
}

export default CreateEscrow;