import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EscrowCard from "./EscrowCard";
import ActivityItem from "./ActivityItem";

function makeEscrow(overrides = {}) {
  return {
    id: "7",
    amountText: "5.00 USDC",
    clientText: "0x1111...1111",
    freelancerText: "0x2222...2222",
    status: { label: "Funded", className: "funded" },
    ...overrides,
  };
}

describe("EscrowCard", () => {
  it("renders id, amount, status and parties", () => {
    render(<EscrowCard escrow={makeEscrow()} />);
    expect(screen.getByText("Escrow #7")).toBeInTheDocument();
    expect(screen.getByText("5.00 USDC")).toBeInTheDocument();
    expect(screen.getByText("Funded")).toBeInTheDocument();
    expect(screen.getByText("0x1111...1111")).toBeInTheDocument();
    expect(screen.getByText("0x2222...2222")).toBeInTheDocument();
  });

  it("calls onSelect on click", () => {
    const onSelect = vi.fn();
    const escrow = makeEscrow();
    render(<EscrowCard escrow={escrow} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith(escrow);
  });

  it("calls onSelect on Enter key", () => {
    const onSelect = vi.fn();
    render(<EscrowCard escrow={makeEscrow()} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalled();
  });

  it("renders disputed status badge", () => {
    render(
      <EscrowCard
        escrow={makeEscrow({ status: { label: "Disputed", className: "disputed" } })}
      />,
    );
    expect(screen.getByText("Disputed")).toBeInTheDocument();
  });

  it("is keyboard accessible via space", () => {
    const onSelect = vi.fn();
    render(<EscrowCard escrow={makeEscrow()} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: " " });
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("ActivityItem", () => {
  const baseItem = {
    label: "Funds Released",
    tone: "completed",
    icon: "🚀",
    escrowId: "7",
    detail: "5.00 USDC sent to freelancer",
    timeAgo: "2m ago",
    txHash: "0x1234567890abcdef1234567890abcdef12345678",
  };

  it("renders event details", () => {
    render(<ActivityItem item={baseItem} />);
    expect(screen.getByText("Funds Released")).toBeInTheDocument();
    expect(screen.getByText("Escrow #7")).toBeInTheDocument();
    expect(screen.getByText("5.00 USDC sent to freelancer")).toBeInTheDocument();
    expect(screen.getByText("2m ago")).toBeInTheDocument();
    expect(screen.getByText("0x1234...5678")).toBeInTheDocument(); // shortened tx hash
  });

  it("falls back gracefully for unknown tones", () => {
    render(<ActivityItem item={{ ...baseItem, tone: "mystery" }} />);
    expect(screen.getByText("Funds Released")).toBeInTheDocument();
  });

  it("handles missing tx hash", () => {
    render(<ActivityItem item={{ ...baseItem, txHash: null }} />);
    expect(screen.getByText("--")).toBeInTheDocument();
  });
});
