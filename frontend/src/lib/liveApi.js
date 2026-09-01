const API_BASE = (
  import.meta.env.VITE_BACKEND_URL || "/api"
).replace(/\/$/, "");

async function requestJSON(path, options = {}) {
  const response = await fetch(API_BASE + path, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(function () {
      return "";
    });

    throw new Error(
      text || "Request failed with status " + response.status
    );
  }

  return response.json();
}

export async function fetchHealth(options = {}) {
  return requestJSON("/health", options);
}

export async function fetchLiveSnapshot(options = {}) {
  const params = new URLSearchParams();

  if (options.address) {
    params.set("address", options.address);
  }

  if (
    options.escrowId !== undefined &&
    options.escrowId !== null &&
    options.escrowId !== ""
  ) {
    params.set("escrow_id", String(options.escrowId));
  }

  const query = params.toString();

  return requestJSON(
    "/live" + (query ? "?" + query : ""),
    options
  );
}

export async function fetchEscrows(options = {}) {
  const params = new URLSearchParams();

  params.set(
    "limit",
    String(options.limit !== undefined ? options.limit : 100)
  );

  params.set(
    "offset",
    String(options.offset !== undefined ? options.offset : 0)
  );

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.search) {
    params.set("search", options.search);
  }

  return requestJSON(
    "/escrows?" + params.toString(),
    options
  );
}

export async function fetchSafety(options = {}) {
  return requestJSON("/safety", options);
}

export async function fetchHistory(options = {}) {
  const params = new URLSearchParams();

  params.set(
    "limit",
    String(options.limit !== undefined ? options.limit : 500),
  );

  params.set(
    "offset",
    String(options.offset !== undefined ? options.offset : 0),
  );

  return requestJSON("/history?" + params.toString(), options);
}

export async function chatWithAssistant(message, history = [], wallet = "") {
  const controller = new AbortController();

  const timeoutId = setTimeout(function () {
    controller.abort();
  }, 30000);

  try {
    const response = await fetch(API_BASE + "/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        message: message,
        history: history,
        wallet: wallet || "",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(function () {
        return "";
      });

      throw new Error(
        text || "Request failed with status " + response.status
      );
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getApiBase() {
  return API_BASE;
}

// Map a backend feed event (from /live or the SSE stream) into the shape the
// activity feed and transactions list expect. Kept in one place so the SSE
// path and the polling path can never drift apart.
export function mapFeedEvent(ev, index = 0) {
  return {
    key: `${ev.tx_hash}-${ev.block}-${index}`,
    label: ev.label ?? ev.event ?? "Event",
    tone: ev.tone ?? "waiting",
    icon: ev.icon ?? "•",
    escrowId: ev.escrow_id != null ? String(ev.escrow_id) : "--",
    txHash: ev.tx_hash,
    blockNumber: ev.block,
    timeAgo:
      ev.time_ago != null
        ? relativeTimeLabel(ev.time_ago)
        : "just now",
    detail: ev.detail ?? `${ev.label ?? ev.event ?? "Event"} on-chain.`,
  };
}

function relativeTimeLabel(timeAgoSeconds) {
  const diffSeconds = Math.max(0, timeAgoSeconds);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const m = Math.floor(diffSeconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Activity history persistence (localStorage). Raw backend feed events are
// stored so the user's previous transaction history survives a browser refresh
// even when the backend is unreachable. The backend /history endpoint remains
// the authoritative source; this is a local, offline-friendly backstop.
// ---------------------------------------------------------------------------
const ACTIVITY_HISTORY_KEY = "arcbridge-activity-history";
const MAX_ACTIVITY_HISTORY = 500;

export function activityEventKey(ev) {
  return `${ev?.tx_hash ?? ""}-${ev?.block ?? ""}`;
}

export function mergeActivityHistory(existing, incoming) {
  const seen = new Set((existing || []).map(activityEventKey));
  const merged = (existing || []).slice();
  for (const ev of incoming || []) {
    const key = activityEventKey(ev);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(ev);
  }
  merged.sort((a, b) => (b.block ?? 0) - (a.block ?? 0));
  return merged.slice(0, MAX_ACTIVITY_HISTORY);
}

export function loadActivityHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ACTIVITY_HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActivityHistory(events) {
  if (typeof window === "undefined") return;
  try {
    const merged = mergeActivityHistory(loadActivityHistory(), events);
    window.localStorage.setItem(ACTIVITY_HISTORY_KEY, JSON.stringify(merged));
  } catch {
    // Storage may be unavailable (private mode / quota) — persistence is
    // best-effort and must never break the dashboard.
  }
}

// Open a Server-Sent Events stream and invoke onEvent for each newly-indexed
// feed event. Returns a cleanup function that closes the connection. This is
// the near-real-time path — the poller pushes events here the moment they are
// scanned, so the UI no longer has to wait for its next /live poll.
export function subscribeToEvents(onEvent, onError = () => {}) {
  let closed = false;
  const controller = new AbortController();

  (async function connect() {
    // The connection is long-lived; retry on transient failures so a single
    // dropped stream doesn't permanently silence the live feed. The 30s poll
    // remains as a safety net regardless.
    while (!closed) {
      try {
        const response = await fetch(API_BASE + "/events", {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error("SSE request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!closed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            const dataLines = part
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());

            if (!dataLines.length) continue;
            try {
              const event = JSON.parse(dataLines.join("\n"));
              if (!closed) onEvent(event);
            } catch {
              // Ignore malformed frames; the next poll re-syncs.
            }
          }
        }
      } catch (err) {
        if (closed) break;
        onError(err);
      }

      if (!closed) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  })();

  return function cleanup() {
    closed = true;
    controller.abort();
  };
}