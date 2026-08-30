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

export async function chatWithAssistant(message, history = []) {
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