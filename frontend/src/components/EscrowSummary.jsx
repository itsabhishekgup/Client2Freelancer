import { useEffect, useState } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { CONTRACT_ADDRESS } from "../contracts/config";

function shortenAddress(address) {
  if (!address || typeof address !== "string") return "--";
  if (!address.startsWith("0x") || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function normalizeEscrowId(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value).trim();

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const digits = raw.match(/\d+/g)?.join("");
  if (digits) {
    return Number(digits);
  }

  return null;
}

function getStatusMeta(escrow) {
  if (!escrow) return { label: "Waiting", className: "waiting" };
  if (escrow.released) return { label: "Completed", className: "completed" };
  if (escrow.approved) return { label: "Approved", className: "approved" };
  if (escrow.workSubmitted) return { label: "Work Submitted", className: "submitted" };
  if (escrow.funded) return { label: "Funded", className: "funded" };
  return { label: "Waiting", className: "waiting" };
}

function EscrowSummary({ escrowId }) {
  const [escrow, setEscrow] = useState(null);
  const [networkName, setNetworkName] = useState("Arc Testnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchEscrowData = async () => {
      const id = normalizeEscrowId(escrowId);

      if (!id) {
        setEscrow(null);
        setError("");
        return;
      }

      if (!window.ethereum) {
        setEscrow(null);
        setError("Wallet not available");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const provider = new BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, provider);

        const data = await contract.escrows(id);

        const client = data.client ?? data[0];
        const freelancer = data.freelancer ?? data[1];
        const amount = data.amount ?? data[2];
        const funded = data.funded ?? data[3];
        const workSubmitted = data.workSubmitted ?? data[4];
        const approved = data.approved ?? data[5];
        const released = data.released ?? data[6];

        const formattedEscrow = {
          id: String(id),
          client: shortenAddress(client),
          freelancer: shortenAddress(freelancer),
          amount: `${Number(formatUnits(amount, 6)).toFixed(2)} USDC`,
          funded: Boolean(funded),
          workSubmitted: Boolean(workSubmitted),
          approved: Boolean(approved),
          released: Boolean(released),
        };

        if (!cancelled) {
          setEscrow(formattedEscrow);
          setNetworkName(network?.name && network.name !== "unknown" ? network.name : "Arc Testnet");
        }
      } catch (err) {
        if (!cancelled) {
          setEscrow(null);
          setError(err?.shortMessage || err?.reason || err?.message || "Failed to load escrow data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchEscrowData();

    return () => {
      cancelled = true;
    };
  }, [escrowId]);

  const statusMeta = getStatusMeta(escrow);

  return (
    <section className="card escrow-summary">
      <div className="summary-header">
        <div>
          <h3>Escrow Summary</h3>
          <p>Current escrow details</p>
        </div>

        <span className={`status-badge ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      <p className="summary-subtitle">
        {loading
          ? "Loading live escrow details..."
          : error
            ? error
            : "Current escrow details are loaded directly from the contract."}
      </p>

      <div className="summary-item">
        <span>Escrow ID</span>
        <strong>{escrow?.id ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Client</span>
        <strong>{escrow?.client ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Freelancer</span>
        <strong>{escrow?.freelancer ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Amount</span>
        <strong>{escrow?.amount ?? "--"}</strong>
      </div>

      <div className="summary-item">
        <span>Network</span>
        <strong>{networkName}</strong>
      </div>

      <div className="summary-item">
        <span>Status</span>
        <strong className={`status-pill ${statusMeta.className}`}>
          {statusMeta.label}
        </strong>
      </div>
    </section>
  );
}

export default EscrowSummary;
