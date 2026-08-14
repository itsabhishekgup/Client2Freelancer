let listeners = [];
let toastId = 0;

/**
 * Show a toast notification. Works from any module (components or plain JS)
 * without needing React context.
 *
 * @param {string} message
 * @param {"success" | "error" | "info" | "warning" | "pending"} [type="info"]
 * @param {{ duration?: number; link?: string; linkLabel?: string }} [opts]
 * @returns {number} toast id — pass to `updateToast` to morph this toast.
 */
export function toast(message, type = "info", opts = {}) {
  const entry = {
    id: ++toastId,
    message,
    type,
    duration: opts.duration ?? 4500,
    link: opts.link,
    linkLabel: opts.linkLabel,
  };
  listeners.forEach((listener) => listener({ kind: "add", entry }));
  return entry.id;
}

/**
 * Update an existing toast in place (e.g. pending → success with a link).
 *
 * @param {number} id — id returned by `toast()`.
 * @param {{ message?: string; type?: string; duration?: number; link?: string; linkLabel?: string }} patch
 */
export function updateToast(id, patch) {
  listeners.forEach((listener) => listener({ kind: "update", id, patch }));
}

export function subscribeToasts(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
