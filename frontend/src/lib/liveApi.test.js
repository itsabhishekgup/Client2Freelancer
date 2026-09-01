import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchLiveSnapshot,
  fetchEscrows,
  fetchHealth,
  fetchSafety,
  fetchHistory,
  chatWithAssistant,
  getApiBase,
  mapFeedEvent,
  loadActivityHistory,
  saveActivityHistory,
  mergeActivityHistory,
} from "./liveApi";

const API_BASE = (import.meta.env.VITE_BACKEND_URL || "/api").replace(/\/$/, "");

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchOnce({ ok = true, json = {}, text = "" } = {}) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 500,
    json: async () => json,
    text: async () => text,
  });
}

describe("getApiBase", () => {
  it("returns the backend base URL without trailing slash", () => {
    expect(getApiBase()).toBe(API_BASE);
  });
});

describe("mapFeedEvent", () => {
  it("maps a backend feed event into the activity/transaction shape", () => {
    const item = mapFeedEvent(
      {
        event: "FundsDeposited",
        label: "Funds Deposited",
        tone: "funded",
        icon: "💰",
        escrow_id: "13",
        tx_hash: "0xabc123",
        block: 123456,
        time_ago: 30,
        detail: "2.00 USDC locked in escrow",
      },
      0,
    );

    expect(item.key).toBe("0xabc123-123456-0");
    expect(item.label).toBe("Funds Deposited");
    expect(item.escrowId).toBe("13");
    expect(item.blockNumber).toBe(123456);
    expect(item.timeAgo).toBe("30s ago");
    expect(item.detail).toBe("2.00 USDC locked in escrow");
  });

  it("falls back to defaults for missing fields", () => {
    const item = mapFeedEvent({ tx_hash: "0x1", block: 5 });
    expect(item.label).toBe("Event");
    expect(item.icon).toBe("•");
    expect(item.escrowId).toBe("--");
    expect(item.timeAgo).toBe("just now");
  });
});

describe("fetchLiveSnapshot", () => {
  it("builds a plain /live request with no params", async () => {
    const fetchMock = mockFetchOnce({ json: { events: [] } });
    await fetchLiveSnapshot();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/live`, expect.objectContaining({ method: "GET" }));
  });

  it("appends address and escrow_id query params", async () => {
    const fetchMock = mockFetchOnce({ json: {} });
    await fetchLiveSnapshot({ address: "0xabc", escrowId: "7" });
    const url = fetchMock.mock.calls[0][0];
    expect(url).toBe(`${API_BASE}/live?address=0xabc&escrow_id=7`);
  });

  it("omits escrow_id when empty", async () => {
    const fetchMock = mockFetchOnce({ json: {} });
    await fetchLiveSnapshot({ address: "0xabc" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/live?address=0xabc`);
  });
});

describe("fetchEscrows", () => {
  it("sends limit, offset and filters", async () => {
    const fetchMock = mockFetchOnce({ json: { escrows: [] } });
    await fetchEscrows({ limit: 25, offset: 10, status: "funded", search: "0x11" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_BASE}/escrows?limit=25&offset=10&status=funded&search=0x11`,
    );
  });

  it("defaults limit to 100 with no filters", async () => {
    const fetchMock = mockFetchOnce({ json: { escrows: [] } });
    await fetchEscrows();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/escrows?limit=100&offset=0`);
  });

  it("throws with response text on non-ok", async () => {
    mockFetchOnce({ ok: false, text: "boom" });
    await expect(fetchEscrows()).rejects.toThrow("boom");
  });
});

describe("fetchHealth / fetchSafety / fetchHistory", () => {
  it("fetchHealth hits /health", async () => {
    const fetchMock = mockFetchOnce({ json: { ok: true } });
    await fetchHealth();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/health`, expect.anything());
  });

  it("fetchSafety hits /safety", async () => {
    const fetchMock = mockFetchOnce({ json: { checks: {} } });
    await fetchSafety();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/safety`, expect.anything());
  });

  it("fetchHistory sends limit and offset", async () => {
    const fetchMock = mockFetchOnce({ json: { events: [] } });
    await fetchHistory({ limit: 25, offset: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/history?limit=25&offset=10`);
  });

  it("fetchHistory defaults limit to 500", async () => {
    const fetchMock = mockFetchOnce({ json: { events: [] } });
    await fetchHistory();
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/history?limit=500&offset=0`);
  });
});

describe("activity history persistence", () => {
  it("mergeActivityHistory de-duplicates, sorts newest first, and caps at 500", () => {
    const existing = [
      { tx_hash: "0x1", block: 5 },
      { tx_hash: "0x2", block: 3 },
    ];
    const incoming = [
      { tx_hash: "0x3", block: 10 },
      { tx_hash: "0x1", block: 5 }, // duplicate
    ];
    const merged = mergeActivityHistory(existing, incoming);
    expect(merged.map((e) => e.tx_hash)).toEqual(["0x3", "0x1", "0x2"]);
  });

  it("saveActivityHistory + loadActivityHistory round-trips via localStorage", () => {
    const events = [
      { tx_hash: "0xaaa", block: 7 },
      { tx_hash: "0xbbb", block: 4 },
    ];
    saveActivityHistory(events);
    const loaded = loadActivityHistory();
    expect(loaded.map((e) => e.tx_hash)).toEqual(["0xaaa", "0xbbb"]);
  });
});

describe("chatWithAssistant", () => {
  it("POSTs message + history as JSON", async () => {
    const fetchMock = mockFetchOnce({ json: { answer: "hi", source: "rules" } });
    const result = await chatWithAssistant("how do I create", [{ role: "user", content: "hi" }]);
    expect(result.answer).toBe("hi");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/chat`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      message: "how do I create",
      history: [{ role: "user", content: "hi" }],
      wallet: "",
    });
  });

  it("aborts after 30s timeout and clears the timer", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal;
      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
        capturedSignal = init.signal;
        return new Promise((_, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      });

      const promise = chatWithAssistant("question");
      vi.advanceTimersByTime(30000);
      await expect(promise).rejects.toThrow();
      expect(capturedSignal.aborted).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
