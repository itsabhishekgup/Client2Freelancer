import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider, parseUnits } from "ethers";

import escrowArtifact from "../contracts/ArcBridgeEscrow.json";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";
import { approveUSDC, ensureArcNetwork, getBrowserProvider } from "../contracts/wallet";
import { useWalletBridge } from "../hooks/useWalletBridge";
import { toast, updateToast } from "../lib/toast";

const PUBLIC_RPC_URL = arcTestnet.rpcUrls.default.http[0];
const TX_EXPLORER_URL = arcTestnet.blockExplorers?.default?.url ?? "";

const explorerLink = (txHash) =>
  TX_EXPLORER_URL && txHash ? `${TX_EXPLORER_URL}/tx/${txHash}` : null;
const readContract = new Contract(
  CONTRACT_ADDRESS,
  escrowArtifact.abi,
  new JsonRpcProvider(PUBLIC_RPC_URL),
);

function mapEscrowState(data, id) {
  const client = data?.client ?? data?.[0];
  const freelancer = data?.freelancer ?? data?.[1];
  const amount = data?.amount ?? data?.[2];
  const funded = data?.funded ?? data?.[3];
  const workSubmitted = data?.workSubmitted ?? data?.[4];
  const approved = data?.approved ?? data?.[5];
  const released = data?.released ?? data?.[6];
  const refunded = data?.refunded ?? data?.[7];
  const disputed = data?.disputed ?? data?.[8];
  const createdAt = data?.createdAt ?? data?.[9];
  const expiresAt = data?.expiresAt ?? data?.[10];

  return {
    id: String(id),
    client,
    freelancer,
    amount,
    funded: Boolean(funded),
    workSubmitted: Boolean(workSubmitted),
    approved: Boolean(approved),
    released: Boolean(released),
    refunded: Boolean(refunded),
    disputed: Boolean(disputed),
    createdAt,
    expiresAt,
  };
}

function CreateEscrow({
  escrowId,
  setEscrowId,
  setCurrentStep = () => {},
  onBlockchainUpdate = () => {},
  defaultExpiryDays = 0,
}) {
  const [freelancer, setFreelancer] = useState("");
  const [amount, setAmount] = useState("");
  const [escrow, setEscrow] = useState(null);
  const [arbitrator, setArbitrator] = useState("");
  const [escrowLoading, setEscrowLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const { walletProvider, address, isConnected, openConnect } = useWalletBridge();

  const escrowValue = escrowId?.toString?.() ?? String(escrowId ?? "").trim();
  const escrowNum = Number(escrowValue);

  // Load escrow + arbitrator whenever the ID or connected wallet changes.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!escrowValue || Number.isNaN(escrowNum) || escrowNum <= 0) {
        setEscrow(null);
        return;
      }
      setEscrowLoading(true);
      try {
        const [data, arb] = await Promise.all([
          readContract.escrows(escrowNum),
          readContract.arbitrator(),
        ]);
        if (cancelled) return;
        setEscrow(mapEscrowState(data, escrowNum));
        setArbitrator(arb);
      } catch (err) {
        console.error("escrow load error:", err);
        if (!cancelled) setEscrow(null);
      } finally {
        if (!cancelled) setEscrowLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrowValue, escrowNum, address]);

  const refreshEscrow = () => {
    onBlockchainUpdate();
    // Force the effect to re-run even if the ID string is unchanged.
    const id = escrowValue;
    setEscrow(null);
    setEscrowLoading(true);
    (async () => {
      try {
        const [data, arb] = await Promise.all([
          readContract.escrows(Number(id)),
          readContract.arbitrator(),
        ]);
        setEscrow(mapEscrowState(data, Number(id)));
        setArbitrator(arb);
      } catch (err) {
        console.error("escrow reload error:", err);
      } finally {
        setEscrowLoading(false);
      }
    })();
  };

  // ---- Role detection -------------------------------------------------------
  const wallet = (address || "").toLowerCase();
  const isClient = Boolean(escrow && escrow.client && escrow.client.toLowerCase() === wallet);
  const isFreelancer = Boolean(
    escrow && escrow.freelancer && escrow.freelancer.toLowerCase() === wallet,
  );
  const isArbitrator = Boolean(arbitrator && arbitrator.toLowerCase() === wallet);
  const isParticipant = isClient || isFreelancer;
  // expiresAt is 0 until the client funds the escrow (the expiry clock starts
  // at funding), so an unfunded escrow is never "expired".
  const isExpired =
    escrow && Number(escrow.expiresAt) > 0
      ? Math.floor(Date.now() / 1000) >= Number(escrow.expiresAt)
      : false;

  const hasId = Boolean(escrowValue && !Number.isNaN(escrowNum) && escrowNum > 0);

  // ---- Action handlers ------------------------------------------------------
  // Guard every tx action: block re-entry while one is in flight and clear
  // the pending flag once it settles (success or error).
  // Shows a pending toast with a spinner, then hands its id to the action so it
  // can morph the same toast into success (with tx link) or error on settle.
  const withPending = async (key, pendingLabel, fn) => {
    if (pendingAction) return;
    setPendingAction(key);
    const pendingToastId = toast(pendingLabel, "pending", { duration: 0 });
    try {
      await fn(pendingToastId);
    } finally {
      setPendingAction(null);
    }
  };

  const handleApproveUSDC = async () => {
    await withPending("approve", "Waiting for confirmation — Approve USDC…", async (toastId) => {
      if (!amount || Number(amount) <= 0) {
        updateToast(toastId, { message: "Enter a valid USDC amount", type: "warning", duration: 4500 });
        return;
      }

      if (!getBrowserProvider(walletProvider)) {
        updateToast(toastId, { message: "Please connect a wallet first", type: "warning", duration: 4500 });
        openConnect();
        return;
      }

      const net = await ensureArcNetwork(walletProvider);
      if (!net.ok) {
        updateToast(toastId, { message: net.message, type: "warning", duration: 6000 });
        return;
      }

      const result = await approveUSDC(amount, walletProvider);

      if (result?.ok) {
        updateToast(toastId, {
          message: "USDC Approved Successfully!",
          type: "success",
          link: explorerLink(result.hash),
          duration: 7000,
        });
        setCurrentStep(2);
        onBlockchainUpdate();
      } else {
        updateToast(toastId, {
          message: result?.message || "Approval Failed",
          type: "error",
          duration: 7000,
        });
      }
    });
  };

  const connectContract = async () => {
    const provider = getBrowserProvider(walletProvider);

    if (!provider) {
      toast("Please connect a wallet first", "warning");
      openConnect();
      return null;
    }

    const net = await ensureArcNetwork(walletProvider);
    if (!net.ok) {
      toast(net.message, "warning");
      return null;
    }

    const signer = await provider.getSigner();
    return new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);
  };

  const createEscrow = async () => {
    await withPending("create", "Waiting for confirmation — Create Escrow…", async (toastId) => {
      try {
        if (!freelancer || !amount || Number(amount) <= 0) {
          updateToast(toastId, {
            message: "Enter a valid freelancer address and amount",
            type: "warning",
            duration: 4500,
          });
          return;
        }

        const contract = await connectContract();
        if (!contract) return;

        const tx =
          defaultExpiryDays > 0
            ? await contract.createEscrowWithDeadline(
                freelancer.trim(),
                parseUnits(amount.toString(), 6),
                defaultExpiryDays * 24 * 60 * 60,
              )
            : await contract.createEscrow(
                freelancer.trim(),
                parseUnits(amount.toString(), 6),
              );
        const createTxHash = tx.hash;

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
          updateToast(toastId, {
            message: "Escrow created, but event details were not found.",
            type: "warning",
            duration: 7000,
          });
          return;
        }

        setEscrowId(newId);
        setCurrentStep(1);
        onBlockchainUpdate(newId);
        updateToast(toastId, {
          message: `Escrow Created! ID: ${newId}`,
          type: "success",
          link: explorerLink(createTxHash),
          duration: 7000,
        });
      } catch (err) {
        console.error(err);
        updateToast(toastId, {
          message: err.shortMessage || err.reason || err.message,
          type: "error",
          duration: 7000,
        });
      }
    });
  };

  const depositFunds = async () => {
    await withPending("deposit", "Waiting for confirmation — Deposit Funds…", async (toastId) => {
      try {
        if (!getBrowserProvider(walletProvider)) {
          updateToast(toastId, {
            message: "Please connect a wallet first",
            type: "warning",
            duration: 4500,
          });
          openConnect();
          return;
        }

        if (!escrowValue || Number.isNaN(escrowNum) || escrowNum <= 0) {
          updateToast(toastId, { message: "Enter escrow ID first", type: "warning", duration: 4500 });
          return;
        }

        const provider = getBrowserProvider(walletProvider);
        if (!provider) {
          updateToast(toastId, {
            message: "Please connect a wallet first",
            type: "warning",
            duration: 4500,
          });
          openConnect();
          return;
        }

        const net = await ensureArcNetwork(walletProvider);
        if (!net.ok) {
          updateToast(toastId, { message: net.message, type: "warning", duration: 6000 });
          return;
        }

        const signer = await provider.getSigner();
        const walletAddr = await signer.getAddress();
        const contract = new Contract(CONTRACT_ADDRESS, escrowArtifact.abi, signer);

        if (!escrow || escrow.client.toLowerCase() !== walletAddr.toLowerCase()) {
          updateToast(toastId, { message: "Wrong Escrow ID selected.", type: "error", duration: 7000 });
          return;
        }

        if (escrow.funded) {
          updateToast(toastId, {
            message: "This escrow is already funded.",
            type: "warning",
            duration: 4500,
          });
          return;
        }

        const tx = await contract.depositFunds(escrowNum);
        const depositTxHash = tx.hash;
        await tx.wait();

        updateToast(toastId, {
          message: "Funds Deposited Successfully!",
          type: "success",
          link: explorerLink(depositTxHash),
          duration: 7000,
        });
        setCurrentStep(3);
        refreshEscrow();
      } catch (err) {
        console.error(err);
        updateToast(toastId, {
          message: err.shortMessage || err.reason || err.message,
          type: "error",
          duration: 7000,
        });
      }
    });
  };

  const runAction = async (key, actionName, fn, nextStep) => {
    await withPending(key, `Waiting for confirmation — ${actionName}…`, async (toastId) => {
      try {
        const contract = await connectContract();
        if (!contract) return;

        if (!hasId) {
          updateToast(toastId, { message: "Enter escrow ID first", type: "warning", duration: 4500 });
          return;
        }

        const tx = await fn(contract, escrowNum);
        const actionTxHash = tx.hash;
        await tx.wait();

        updateToast(toastId, {
          message: `${actionName} Successfully!`,
          type: "success",
          link: explorerLink(actionTxHash),
          duration: 7000,
        });
        if (nextStep) setCurrentStep(nextStep);
        refreshEscrow();
      } catch (err) {
        console.error(err);
        updateToast(toastId, {
          message: err.shortMessage || err.reason || err.message,
          type: "error",
          duration: 7000,
        });
      }
    });
  };

  const submitWork = () =>
    runAction("submit", "Work Submitted", (c) => c.submitWork(escrowNum), 4);
  const approveWork = () =>
    runAction("approve-work", "Work Approved", (c) => c.approveWork(escrowNum), 5);
  const releaseFunds = () =>
    runAction("release", "Funds Released", (c) => c.releaseFunds(escrowNum), 6);
  const cancelEscrow = () =>
    runAction("cancel", "Escrow Cancelled", (c) => c.cancelEscrow(escrowNum));
  const disputeEscrow = () =>
    runAction("dispute", "Dispute Raised", (c) => c.disputeEscrow(escrowNum));
  const claimAfterExpiry = () =>
    runAction("claim", "Claimed After Expiry", (c) => c.claimAfterExpiry(escrowNum));
  const resolveDispute = (favorFreelancer) =>
    runAction(
      favorFreelancer ? "resolve-freelancer" : "resolve-client",
      favorFreelancer
        ? "Dispute Resolved — funds released to freelancer"
        : "Dispute Resolved — funds refunded to client",
      (c) => c.resolveDispute(escrowNum, favorFreelancer),
    );

  // ---- Role + state based button config ------------------------------------
  const closed = escrow && (escrow.released || escrow.refunded);

  const buttons = [
    {
      key: "create",
      label: "Create Escrow",
      className: "premium-action-btn--create",
      onClick: createEscrow,
      visible: true,
      disabled: !isConnected,
      title: !isConnected ? "Connect a wallet first" : "Create a new escrow",
    },
    {
      key: "approve",
      label: "Approve USDC",
      className: "premium-action-btn--approve",
      onClick: handleApproveUSDC,
      visible: isConnected,
      disabled: !amount || Number(amount) <= 0,
      title: "Enter a USDC amount first",
    },
    {
      key: "deposit",
      label: "Deposit Funds",
      className: "premium-action-btn--deposit",
      onClick: depositFunds,
      visible: isClient,
      disabled:
        !hasId || !escrow || escrow.funded || escrow.refunded || escrow.disputed || isExpired,
      title: !hasId
        ? "Enter escrow ID first"
        : escrow?.funded
          ? "Already funded"
          : escrow?.refunded || escrow?.disputed
            ? "Escrow is closed"
            : isExpired
              ? "Escrow expired — cancel to refund"
              : "Client: lock the USDC into the escrow",
    },
    {
      key: "submit",
      label: "Submit Work",
      className: "premium-action-btn--submit",
      onClick: submitWork,
      visible: isFreelancer,
      disabled:
        !hasId || !escrow || !escrow.funded || escrow.workSubmitted || closed || escrow.disputed || isExpired,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.funded
          ? "Wait for the client to fund the escrow"
          : escrow?.workSubmitted
            ? "Already submitted"
            : closed
              ? "Escrow is closed"
              : isExpired
                ? "Escrow expired"
                : "Freelancer: mark work as delivered",
    },
    {
      key: "approve-work",
      label: "Approve Work",
      className: "premium-action-btn--approve-work",
      onClick: approveWork,
      visible: isClient,
      disabled:
        !hasId || !escrow || !escrow.workSubmitted || escrow.approved || closed || escrow.disputed,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.workSubmitted
          ? "Wait for the freelancer to submit work"
          : escrow?.approved
            ? "Already approved"
            : closed
              ? "Escrow is closed"
              : "Client: confirm the delivered work",
    },
    {
      key: "release",
      label: "Release Funds",
      className: "premium-action-btn--release",
      onClick: releaseFunds,
      visible: isClient || isFreelancer,
      disabled: !hasId || !escrow || !escrow.approved || escrow.released || escrow.disputed,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.approved
          ? "Approve the work first"
          : escrow?.released
            ? "Already released"
            : isClient
              ? "Client: pay the freelancer"
              : "Freelancer: release the approved funds",
    },
    {
      key: "cancel",
      label: "Cancel Escrow",
      className: "premium-action-btn--cancel",
      onClick: cancelEscrow,
      visible: isClient,
      disabled:
        !hasId || !escrow || closed || escrow.disputed || escrow.approved || (escrow.funded && (!isExpired || escrow.workSubmitted)),
      title: !hasId
        ? "Enter escrow ID first"
        : closed
          ? "Escrow is closed"
          : escrow?.disputed
            ? "Resolve the dispute first"
            : escrow?.approved
              ? "Work approved — use Release Funds"
              : escrow?.funded && !isExpired
                ? "Funded escrows can only be cancelled after expiry"
                : escrow?.funded && escrow?.workSubmitted
                  ? "Work submitted — freelancer owns the claim path"
                  : "Client: cancel and get a refund",
    },
    {
      key: "claim",
      label: "Claim After Expiry",
      className: "premium-action-btn--claim",
      onClick: claimAfterExpiry,
      visible: isFreelancer,
      disabled:
        !hasId || !escrow || !escrow.funded || !escrow.workSubmitted || escrow.approved || closed || escrow.disputed || !isExpired,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.funded
          ? "Wait for the client to fund the escrow"
          : !escrow?.workSubmitted
            ? "Submit your work first"
            : escrow?.approved
              ? "Work approved — use Release Funds instead"
              : closed
                ? "Escrow is closed"
                : !isExpired
                  ? `Claim unlocks at expiry (${new Date(Number(escrow.expiresAt) * 1000).toLocaleString()})`
                  : "Freelancer: claim funds after expiry",
    },
    {
      key: "dispute",
      label: "Dispute Escrow",
      className: "premium-action-btn--dispute",
      onClick: disputeEscrow,
      visible: isParticipant,
      disabled: !hasId || !escrow || !escrow.funded || closed || escrow.disputed,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.funded
          ? "Only funded escrows can be disputed"
          : closed
            ? "Escrow is closed"
            : escrow?.disputed
              ? "Dispute already raised"
              : "Client/Freelancer: raise a dispute",
    },
    {
      key: "resolve-freelancer",
      label: "Resolve → Freelancer",
      className: "premium-action-btn--resolve-freelancer",
      onClick: () => resolveDispute(true),
      visible: isArbitrator,
      disabled: !hasId || !escrow || !escrow.disputed || closed,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.disputed
          ? "No open dispute"
          : "Arbitrator: pay the freelancer",
    },
    {
      key: "resolve-client",
      label: "Resolve → Client",
      className: "premium-action-btn--resolve-client",
      onClick: () => resolveDispute(false),
      visible: isArbitrator,
      disabled: !hasId || !escrow || !escrow.disputed || closed,
      title: !hasId
        ? "Enter escrow ID first"
        : !escrow?.disputed
          ? "No open dispute"
          : "Arbitrator: refund the client",
    },
  ];

  const visibleButtons = buttons.filter((b) => b.visible);

  let roleLabel = "Connect wallet to see role-based actions";
  if (isConnected) {
    const roles = [];
    if (isArbitrator) roles.push("Arbitrator");
    if (isClient) roles.push("Client");
    if (isFreelancer) roles.push("Freelancer");
    if (roles.length === 0) roles.push("Observer (not a participant)");
    roleLabel = roles.join(" · ");
  }

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

      {isConnected && (
        <div className={`escrow-role-badge${isClient || isFreelancer || isArbitrator ? " escrow-role-badge--active" : ""}`}>
          Role: {roleLabel}
        </div>
      )}

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

      {escrowLoading && <p className="escrow-hint">Loading escrow state…</p>}
      {!escrowLoading && escrow && (
        <p className="escrow-hint">
          Escrow #{escrow.id} · {escrow.funded ? "Funded" : "Unfunded"}
          {escrow.workSubmitted ? " · Work submitted" : ""}
          {escrow.approved ? " · Approved" : ""}
          {escrow.released ? " · Released" : ""}
          {escrow.refunded ? " · Refunded" : ""}
          {escrow.disputed ? " · Disputed" : ""}
          {isExpired ? " · Expired" : ""}
        </p>
      )}
      {!escrowLoading && hasId && !escrow && (
        <p className="escrow-hint">Escrow not found — check the ID.</p>
      )}

      <div className="action-grid premium-action-grid">
        {visibleButtons.map((btn) => {
          const isPending = pendingAction === btn.key;
          return (
            <button
              key={btn.key}
              type="button"
              onClick={btn.onClick}
              className={`premium-action-btn ${btn.className}${isPending ? " premium-action-btn--pending" : ""}`}
              disabled={btn.disabled || pendingAction !== null}
              title={isPending ? "Transaction in progress…" : btn.title}
            >
              {isPending ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Processing…</span>
                </>
              ) : (
                btn.label
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default CreateEscrow;
