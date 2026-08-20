import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveWalletProvider, getBrowserProvider, readWalletSnapshot, approveUSDC, ensureArcNetwork } from "./wallet";

const CONTRACT = "0xa12b4775b2eb4741aabbb8e2aade41e9ad0665e4";
const TX_HASH = "0x" + "ab".repeat(32);

const ethersMocks = vi.hoisted(() => ({
  approve: vi.fn(),
  balanceOf: vi.fn().mockResolvedValue(100_000_000n), // 100 USDC (6 decimals)
  TX_HASH: "0x" + "ab".repeat(32),
}));

// Mock ethers so approveUSDC's internal Contract.approve + tx.wait are fully
// controlled (no real JSON-RPC receipt polling in jsdom).
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal();
  ethersMocks.approve.mockReset().mockResolvedValue({
    hash: ethersMocks.TX_HASH,
    wait: vi.fn().mockResolvedValue({ status: 1 }),
  });
  ethersMocks.balanceOf.mockReset().mockResolvedValue(100_000_000n);

  class FakeContract {
    constructor() {
      this.approve = ethersMocks.approve;
      // readWalletSnapshot calls balanceOf — return 100 * 1e6 (100 USDC).
      this.balanceOf = ethersMocks.balanceOf;
    }
  }

  return {
    ...actual,
    Contract: FakeContract,
  };
});

function makeProvider({ chainId = 5042002, accounts = ["0x1111111111111111111111111111111111111111"] } = {}) {
  const calls = [];
  const provider = {
    calls,
    chainId,
    request: vi.fn(async ({ method }) => {
      calls.push(method);
      if (method === "eth_chainId") return `0x${chainId.toString(16)}`;
      if (method === "eth_accounts") return accounts;
      if (method === "eth_requestAccounts") return accounts;
      if (method === "eth_call") {
        // balanceOf returns a packed uint256 (32 bytes). 100 * 1e6 = 0x5F5E100
        return "0x0000000000000000000000000000000000000000000000000000000005f5e100";
      }
      if (method === "eth_getBalance") return "0x0";
      if (method === "eth_estimateGas") return "0x5208";
      if (method === "eth_gasPrice") return "0x4e3b29200";
      if (method === "eth_getTransactionCount") return "0x0";
      if (method === "eth_blockNumber") return "0x1";
      if (method === "wallet_switchEthereumChain") return null;
      if (method === "wallet_addEthereumChain") return null;
      return null;
    }),
  };
  return provider;
}

function makeWalletProvider(provider) {
  // The EIP-1193 request handler must stay functional across tests — merge
  // the provider's own request mock (eth_chainId etc.) with any test-specific
  // overrides, and expose the base handler for inspection.
  const baseRequest = provider.request;
  const wrapped = { ...provider, on: vi.fn(), removeListener: vi.fn() };
  wrapped.request = vi.fn(async (req) => baseRequest(req));
  return wrapped;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window?.ethereum;
});

describe("resolveWalletProvider", () => {
  it("returns the passed provider when given", () => {
    const p = makeProvider();
    expect(resolveWalletProvider(p)).toBe(p);
  });

  it("falls back to window.ethereum", () => {
    const eth = makeProvider();
    globalThis.window = { ethereum: eth };
    expect(resolveWalletProvider(null)).toBe(eth);
  });

  it("returns null when nothing is available", () => {
    globalThis.window = undefined;
    expect(resolveWalletProvider(null)).toBeNull();
  });
});

describe("getBrowserProvider", () => {
  it("returns null without a provider", () => {
    globalThis.window = undefined;
    expect(getBrowserProvider(null)).toBeNull();
  });

  it("wraps an EIP-1193 provider in a BrowserProvider", () => {
    const p = makeProvider();
    const bp = getBrowserProvider(p);
    expect(bp).toBeTruthy();
  });
});

describe("readWalletSnapshot", () => {
  it("returns disconnected state without provider", async () => {
    globalThis.window = undefined;
    const snap = await readWalletSnapshot(null);
    expect(snap.connected).toBe(false);
    expect(snap.address).toBe("--");
  });

  it("reads address and USDC balance", async () => {
    const p = makeWalletProvider(makeProvider());
    const snap = await readWalletSnapshot(p);
    expect(snap.connected).toBe(true);
    expect(snap.address).toMatch(/^0x1111\.\.\.1111$/);
    expect(snap.balance).toBe("100.00 USDC"); // mock eth_call returns 0x64 = 100 wei units
  });
});

describe("approveUSDC", () => {
  it("returns error without provider", async () => {
    globalThis.window = undefined;
    const res = await approveUSDC("5", null);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/connect/i);
  });

  it("approves with correct spender and amount (6 decimals)", async () => {
    const p = makeWalletProvider(makeProvider());
    const res = await approveUSDC("5", p);
    expect(res.ok).toBe(true);
    expect(res.hash).toBe(TX_HASH);
    // approve(spender, parseUnits("5", 6)) → (CONTRACT, 5000000n)
    expect(ethersMocks.approve).toHaveBeenCalledWith(CONTRACT, 5000000n);
  });
});

describe("ensureArcNetwork", () => {
  it("passes when already on Arc", async () => {
    const p = makeWalletProvider(makeProvider({ chainId: 5042002 }));
    const res = await ensureArcNetwork(p);
    expect(res.ok).toBe(true);
    expect(p.request).not.toHaveBeenCalledWith("wallet_switchEthereumChain");
  });

  it("switches to Arc when on another chain", async () => {
    const p = makeWalletProvider(makeProvider({ chainId: 84532 })); // Base Sepolia
    const res = await ensureArcNetwork(p);
    expect(res.ok).toBe(false);
    // The provider's request fn records the switch call.
    expect(p.request.mock.calls.some((c) => c[0].method === "wallet_switchEthereumChain")).toBe(true);
  });

  it("adds the Arc network when switch fails with 4902", async () => {
    const p = makeWalletProvider(makeProvider({ chainId: 84532 }));
    // Override ONLY the switch to throw 4902; keep chainId answers from base.
    const baseRequest = p.request.getMockImplementation();
    p.request.mockImplementation(async (req) => {
      if (req.method === "wallet_switchEthereumChain") {
        const err = new Error("unrecognized chain");
        err.code = 4902;
        throw err;
      }
      if (req.method === "wallet_addEthereumChain") return null;
      return baseRequest(req);
    });
    const res = await ensureArcNetwork(p);
    expect(res.ok).toBe(false);
    expect(p.request.mock.calls.some((c) => c[0].method === "wallet_addEthereumChain")).toBe(true);
    const addCall = p.request.mock.calls.find((c) => c[0].method === "wallet_addEthereumChain");
    const addParams = addCall?.[0]?.params?.[0];
    expect(addParams.chainId).toBe("0x4cef52");
    expect(addParams.rpcUrls[0]).toContain("arc.network");
  });

  it("returns error without provider", async () => {
    globalThis.window = undefined;
    const res = await ensureArcNetwork(null);
    expect(res.ok).toBe(false);
  });
});
