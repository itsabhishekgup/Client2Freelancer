import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import CreateEscrow from "./CreateEscrow";

const CLIENT = "0x1111111111111111111111111111111111111111";
const FREELANCER = "0x2222222222222222222222222222222222222222";

const ethersMocks = vi.hoisted(() => ({
  escrows: vi.fn(),
  arbitrator: vi.fn(),
}));

// Mock the wallet bridge hook so we can drive connected address / roles.
vi.mock("../hooks/useWalletBridge", () => ({
  useWalletBridge: vi.fn(),
}));

// Mock wallet helpers (approve/deposit txs are not exercised in these tests).
vi.mock("../contracts/wallet", () => ({
  approveUSDC: vi.fn().mockResolvedValue({ ok: true, hash: "0x" }),
  ensureArcNetwork: vi.fn().mockResolvedValue({ ok: true }),
  getBrowserProvider: vi.fn().mockReturnValue({}),
}));

// Mock toasts so the module imports without side effects.
vi.mock("../lib/toast", () => ({
  toast: vi.fn(),
  updateToast: vi.fn(),
}));

// The module builds a readContract at import time with a JsonRpcProvider.
// Provide a stub that answers escrow reads.
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal();

  class FakeContract {
    constructor() {
      this.escrows = ethersMocks.escrows;
      this.arbitrator = ethersMocks.arbitrator;
    }
  }

  return {
    ...actual,
    Contract: FakeContract,
    JsonRpcProvider: class {
      constructor() {}
    },
  };
});

import { useWalletBridge } from "../hooks/useWalletBridge";

function escrowTuple(overrides = {}) {
  return [
    overrides.client ?? CLIENT,
    overrides.freelancer ?? FREELANCER,
    overrides.amount ?? 1_000_000n,
    overrides.funded ?? false,
    overrides.workSubmitted ?? false,
    overrides.approved ?? false,
    overrides.released ?? false,
    overrides.refunded ?? false,
    overrides.disputed ?? false,
    overrides.createdAt ?? 1_700_000_000,
    overrides.expiresAt ?? 0,
  ];
}

function renderWithWallet({ address = CLIENT, escrowData = escrowTuple() } = {}) {
  useWalletBridge.mockReturnValue({
    isConnected: Boolean(address),
    address,
    walletProvider: {},
    openConnect: vi.fn(),
  });
  ethersMocks.escrows.mockResolvedValue(escrowData);
  ethersMocks.arbitrator.mockResolvedValue("0x3333333333333333333333333333333333333333");
  return render(
    <CreateEscrow
      escrowId="7"
      setEscrowId={vi.fn()}
      setCurrentStep={vi.fn()}
      onBlockchainUpdate={vi.fn()}
      defaultExpiryDays={0}
    />,
  );
}

describe("CreateEscrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the form fields", () => {
    renderWithWallet({ address: "" });
    expect(screen.getByPlaceholderText("Freelancer Wallet Address")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("USDC Amount")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escrow ID")).toBeInTheDocument();
    expect(screen.getByText("Create Escrow")).toBeInTheDocument();
  });

  it("shows Create Escrow disabled without a wallet", () => {
    renderWithWallet({ address: "" });
    const createBtn = screen.getByText("Create Escrow").closest("button");
    expect(createBtn).toBeDisabled();
  });

  it("shows client-only actions when the connected wallet is the escrow client", async () => {
    renderWithWallet({ address: CLIENT, escrowData: escrowTuple({ funded: false }) });
    await waitFor(() => {
      // Client role label appears once escrow loads.
      expect(screen.getByText(/Role: Client/)).toBeInTheDocument();
    });
  });

  it("shows Create Escrow enabled when a wallet is connected", () => {
    renderWithWallet({ address: CLIENT });
    const createBtn = screen.getByText("Create Escrow").closest("button");
    expect(createBtn).not.toBeDisabled();
  });
});
