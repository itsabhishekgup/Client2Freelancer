import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EscrowDetailModal from "./EscrowDetailModal";

function makeEscrow(overrides = {}) {
  return {
    id: "7",
    amountText: "5.00 USDC",
    clientText: "0x1111...1111",
    freelancerText: "0x2222...2222",
    status: { label: "Funded", className: "funded" },
    createdAt: 1700000000,
    expiresAt: 1700604800,
    funded: true,
    workSubmitted: false,
    approved: false,
    released: false,
    refunded: false,
    ...overrides,
  };
}

describe("EscrowDetailModal", () => {
  it("renders nothing when escrow is null", () => {
    const { container } = render(<EscrowDetailModal escrow={null} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders escrow details", () => {
    render(<EscrowDetailModal escrow={makeEscrow()} onClose={() => {}} />);
    expect(screen.getByText("Escrow #7")).toBeInTheDocument();
    expect(screen.getByText("5.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(screen.getByText("0x2222...2222")).toBeInTheDocument();
    expect(screen.getByText("Funded")).toBeInTheDocument();
  });

  it("renders state checklist when no events", () => {
    render(<EscrowDetailModal escrow={makeEscrow()} events={[]} onClose={() => {}} />);
    expect(screen.getByText(/no cached on-chain events/i)).toBeInTheDocument();
    // Created is checked; funds deposited checked because funded=true.
    expect(screen.getByText("Escrow created")).toBeInTheDocument();
    expect(screen.getByText("Funds deposited")).toBeInTheDocument();
  });

  it("renders the event timeline", () => {
    const events = [
      {
        label: "Funds Released",
        tone: "completed",
        icon: "🚀",
        txHash: "0x1234567890abcdef1234567890abcdef12345678",
        timeAgo: "2m ago",
        detail: "5.00 USDC sent to freelancer",
        blockNumber: 100,
        logIndex: 0,
      },
    ];
    render(<EscrowDetailModal escrow={makeEscrow()} events={events} onClose={() => {}} />);
    expect(screen.getByText("Funds Released")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
    // The tx hash is rendered with a "↗" suffix, so match by substring.
    expect(screen.getByText(/0x1234\.\.\.5678/)).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<EscrowDetailModal escrow={makeEscrow()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when overlay is clicked", () => {
    const onClose = vi.fn();
    render(<EscrowDetailModal escrow={makeEscrow()} onClose={onClose} />);
    fireEvent.click(document.querySelector(".escrow-modal-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows -- for escrow with no expiry (unfunded)", () => {
    render(
      <EscrowDetailModal
        escrow={makeEscrow({ funded: false, expiresAt: 0 })}
        onClose={() => {}}
      />,
    );
    const rows = screen.getAllByText("--");
    expect(rows.length).toBeGreaterThan(0);
  });
});
