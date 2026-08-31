import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchLiveSnapshot,
  fetchEscrows,
  fetchHealth,
  fetchSafety,
  chatWithAssistant,
  getApiBase,
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

describe("fetchHealth / fetchSafety", () => {
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
