import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  STEPS,
  ACTIVITY_META,
  shortenAddress,
  normalizeEscrowId,
  formatRelativeTime,
  formatAmount,
  getEscrowStatusMeta,
  getWorkflowStep,
  getWorkflowTerminalMeta,
  formatExpiry,
  mapEscrowState,
} from "./escrowFormat";

describe("shortenAddress", () => {
  it("returns -- for falsy input", () => {
    expect(shortenAddress(null)).toBe("--");
    expect(shortenAddress(undefined)).toBe("--");
    expect(shortenAddress("")).toBe("--");
  });

  it("returns non-hex short strings as-is", () => {
    expect(shortenAddress("hello")).toBe("hello");
  });

  it("shortens a full address", () => {
    expect(shortenAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234...5678",
    );
  });

  it("does not shorten very short 0x strings", () => {
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("normalizeEscrowId", () => {
  it("returns null for empty values", () => {
    expect(normalizeEscrowId(null)).toBeNull();
    expect(normalizeEscrowId(undefined)).toBeNull();
    expect(normalizeEscrowId("")).toBeNull();
  });

  it("passes through finite numbers", () => {
    expect(normalizeEscrowId(42)).toBe(42);
  });

  it("parses pure digit strings", () => {
    expect(normalizeEscrowId("42")).toBe(42);
  });

  it("extracts digits from prefixed strings", () => {
    expect(normalizeEscrowId("#42")).toBe(42);
    expect(normalizeEscrowId("escrow 7")).toBe(7);
  });

  it("returns null for non-numeric strings", () => {
    expect(normalizeEscrowId("abc")).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns just now for missing timestamp", () => {
    expect(formatRelativeTime(null)).toBe("just now");
    expect(formatRelativeTime(0)).toBe("just now");
  });

  it("formats seconds ago", () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(now - 30)).toBe("30s ago");
  });

  it("formats minutes ago", () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(now - 120)).toBe("2m ago");
  });

  it("formats hours ago", () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(now - 7200)).toBe("2h ago");
  });

  it("formats days ago", () => {
    const now = Date.now() / 1000;
    expect(formatRelativeTime(now - 3 * 86400)).toBe("3d ago");
  });
});

describe("formatAmount", () => {
  it("formats bigint USDC (6 decimals)", () => {
    expect(formatAmount(1000000n)).toBe("1.00 USDC");
    expect(formatAmount(1500000n)).toBe("1.50 USDC");
    expect(formatAmount(0n)).toBe("0.00 USDC");
  });

  it("formats number input", () => {
    expect(formatAmount(2500000)).toBe("2.50 USDC");
  });

  it("returns -- for invalid input", () => {
    expect(formatAmount("garbage")).toBe("--");
    expect(formatAmount(null)).toBe("--");
    expect(formatAmount(undefined)).toBe("--");
  });
});

describe("getEscrowStatusMeta", () => {
  it("returns Waiting for no escrow", () => {
    expect(getEscrowStatusMeta(null).label).toBe("Waiting");
    expect(getEscrowStatusMeta(undefined).label).toBe("Waiting");
  });

  it("prioritizes disputed over everything", () => {
    const meta = getEscrowStatusMeta({
      disputed: true,
      refunded: true,
      released: true,
      approved: true,
      workSubmitted: true,
      funded: true,
    });
    expect(meta.label).toBe("Disputed");
  });

  it("maps refunded", () => {
    expect(getEscrowStatusMeta({ refunded: true }).label).toBe("Refunded");
  });

  it("maps released to Completed", () => {
    expect(getEscrowStatusMeta({ released: true }).label).toBe("Completed");
  });

  it("maps approved", () => {
    expect(getEscrowStatusMeta({ approved: true, workSubmitted: true }).label).toBe("Approved");
  });

  it("maps workSubmitted", () => {
    expect(getEscrowStatusMeta({ workSubmitted: true }).label).toBe("Work Submitted");
  });

  it("maps funded", () => {
    expect(getEscrowStatusMeta({ funded: true }).label).toBe("Funded");
  });

  it("maps default to Waiting", () => {
    expect(getEscrowStatusMeta({}).label).toBe("Waiting");
  });
});

describe("getWorkflowStep", () => {
  it("returns 0 for no escrow", () => {
    expect(getWorkflowStep(null)).toBe(0);
  });

  it("returns 6 for released", () => {
    expect(getWorkflowStep({ released: true })).toBe(6);
  });

  it("returns 5 for approved", () => {
    expect(getWorkflowStep({ approved: true })).toBe(5);
  });

  it("returns 4 for workSubmitted", () => {
    expect(getWorkflowStep({ workSubmitted: true })).toBe(4);
  });

  it("returns 3 for funded", () => {
    expect(getWorkflowStep({ funded: true })).toBe(3);
  });

  it("returns 1 by default", () => {
    expect(getWorkflowStep({})).toBe(1);
  });
});

describe("getWorkflowTerminalMeta", () => {
  it("returns null for no escrow", () => {
    expect(getWorkflowTerminalMeta(null)).toBeNull();
  });

  it("returns null for an in-progress escrow", () => {
    expect(getWorkflowTerminalMeta({ funded: true })).toBeNull();
  });

  it("maps released to a green completed card", () => {
    const meta = getWorkflowTerminalMeta({ released: true });
    expect(meta.tone).toBe("green");
    expect(meta.icon).toBe("check");
    expect(meta.title).toBe("Completed");
  });

  it("maps refunded to an amber cancelled card", () => {
    const meta = getWorkflowTerminalMeta({ refunded: true });
    expect(meta.tone).toBe("amber");
    expect(meta.icon).toBe("cancel");
    expect(meta.title).toBe("Cancelled");
  });

  it("maps disputed to a red dispute card", () => {
    const meta = getWorkflowTerminalMeta({ disputed: true });
    expect(meta.tone).toBe("red");
    expect(meta.icon).toBe("dispute");
    expect(meta.title).toBe("Disputed");
  });
});

describe("formatExpiry", () => {
  const NOW = 1_700_000_000;

  it("reports no clock for zero/unset expiry", () => {
    expect(formatExpiry(0, NOW).text).toBe("Clock starts at funding");
    expect(formatExpiry(null, NOW).text).toBe("Clock starts at funding");
  });

  it("formats days remaining", () => {
    const r = formatExpiry(NOW + 10 * 24 * 3600, NOW);
    expect(r.text).toBe("Expires in 10d 0h");
    expect(r.tone).toBe("ok");
  });

  it("flags warning tone under 7 days", () => {
    const r = formatExpiry(NOW + 3 * 24 * 3600, NOW);
    expect(r.text).toBe("Expires in 3d 0h");
    expect(r.tone).toBe("warning");
  });

  it("flags urgent tone under 24 hours", () => {
    const r = formatExpiry(NOW + 5 * 3600, NOW);
    expect(r.text).toBe("Expires in 5h 0m");
    expect(r.tone).toBe("urgent");
  });

  it("formats minutes when under an hour", () => {
    const r = formatExpiry(NOW + 600, NOW);
    expect(r.text).toBe("Expires in 10m");
    expect(r.tone).toBe("urgent");
  });

  it("reports expired for past timestamps", () => {
    const r = formatExpiry(NOW - 2 * 3600, NOW);
    expect(r.text).toBe("Expired 2h ago");
    expect(r.tone).toBe("expired");
  });
});

describe("mapEscrowState", () => {
  const rawTuple = [
    "0x1111111111111111111111111111111111111111", // client
    "0x2222222222222222222222222222222222222222", // freelancer
    1000000n, // amount
    true, // funded
    true, // workSubmitted
    false, // approved
    false, // released
    false, // refunded
    false, // disputed
    1700000000, // createdAt
    1700604800, // expiresAt
  ];

  it("maps a tuple-style read", () => {
    const state = mapEscrowState(rawTuple, 7);
    expect(state.id).toBe("7");
    expect(state.client).toBe("0x1111111111111111111111111111111111111111");
    expect(state.amount).toBe(1000000n);
    expect(state.funded).toBe(true);
    expect(state.workSubmitted).toBe(true);
    expect(state.approved).toBe(false);
    expect(state.disputed).toBe(false);
  });

  it("maps an object-style read", () => {
    const state = mapEscrowState(
      {
        client: "0x1111111111111111111111111111111111111111",
        freelancer: "0x2222222222222222222222222222222222222222",
        amount: 2000000n,
        funded: false,
        workSubmitted: false,
        approved: false,
        released: false,
        refunded: true,
        disputed: false,
        createdAt: 1700000000,
        expiresAt: 0,
      },
      3,
    );
    expect(state.id).toBe("3");
    expect(state.refunded).toBe(true);
    expect(state.amount).toBe(2000000n);
    expect(state.expiresAt).toBe(0);
  });

  it("coerces truthy booleans", () => {
    const state = mapEscrowState({ ...rawTuple }, 1);
    expect(typeof state.funded).toBe("boolean");
  });
});

describe("STEPS / ACTIVITY_META", () => {
  it("exposes lifecycle steps in order", () => {
    expect(STEPS).toEqual([
      "Create Escrow",
      "Approve USDC",
      "Deposit Funds",
      "Submit Work",
      "Approve Work",
      "Release Funds",
    ]);
  });

  it("has meta for every tracked event", () => {
    for (const name of [
      "EscrowCreated",
      "FundsDeposited",
      "WorkSubmitted",
      "WorkApproved",
      "FundsReleased",
      "EscrowCancelled",
      "DisputeRaised",
      "DisputeResolved",
      "TokensRescued",
    ]) {
      expect(ACTIVITY_META[name]).toBeTruthy();
    }
  });
});
