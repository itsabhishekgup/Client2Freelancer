import { useEffect, useRef, useState } from "react";
import { subscribeToasts } from "./toast";

const TYPE_ICONS = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "!",
};

export function Toaster() {
  const [toasts, setToasts] = useState([]);
  // Track the auto-dismiss timer per toast so an update (pending → success)
  // clears the old timer instead of stacking two — the first one firing would
  // dismiss the toast early.
  const timersRef = useRef(new Map());

  useEffect(() => {
    const timers = timersRef.current;

    const clearTimer = (id) => {
      const existing = timers.get(id);
      if (existing) {
        clearTimeout(existing);
        timers.delete(id);
      }
    };

    const scheduleDismiss = (id, duration) => {
      clearTimer(id);
      if (!duration || duration <= 0) return;
      const timer = setTimeout(() => {
        timers.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
      timers.set(id, timer);
    };

    const unsubscribe = subscribeToasts((event) => {
      if (event.kind === "add") {
        const entry = event.entry;
        setToasts((prev) => [...prev, entry]);
        scheduleDismiss(entry.id, entry.duration);
        return;
      }

      if (event.kind === "update") {
        setToasts((prev) => prev.map((t) => (t.id === event.id ? { ...t, ...event.patch } : t)));
        // Re-arm the dismiss timer from the NEW duration — the old timer (if
        // any) is cleared above, so a pending (duration 0) → success (7000)
        // morph gets exactly one 7s timer.
        const nextDuration = event.patch.duration;
        if (typeof nextDuration === "number") {
          scheduleDismiss(event.id, nextDuration);
        }
      }
    });
    return () => {
      unsubscribe();
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const dismiss = (id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.type}${t.duration > 0 ? " toast--auto" : ""}`}
          role="status"
        >
          <span className="toast-icon" aria-hidden="true">
            {t.type === "pending" ? (
              <span className="toast-spinner" />
            ) : (
              TYPE_ICONS[t.type] ?? TYPE_ICONS.info
            )}
          </span>
          <span className="toast-message">
            {t.message}
            {t.link ? (
              <a
                className="toast-link"
                href={t.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                {t.linkLabel ?? "View tx ↗"}
              </a>
            ) : null}
          </span>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
