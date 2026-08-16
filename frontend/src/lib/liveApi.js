const API_BASE = (import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function requestJSON(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export async function fetchLiveSnapshot({ address = "", escrowId = "", signal } = {}) {
  const params = new URLSearchParams();
  if (address) params.set("address", address);
  if (escrowId !== "" && escrowId !== null && escrowId !== undefined) params.set("escrow_id", String(escrowId));
  const query = params.toString();
  return requestJSON(`/live${query ? `?${query}` : ""}`, { signal });
}

export async function fetchEscrows({ limit = 100, offset = 0, status = "", search = "", signal } = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  return requestJSON(`/escrows?${params.toString()}`, { signal });
}

export async function fetchHealth() {
  return requestJSON("/health");
}

export async function fetchSafety({ signal } = {}) {
  return requestJSON("/safety", { signal });
}

export async function chatWithAssistant(message, history = []) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export function getApiBase() {
  return API_BASE;
}
