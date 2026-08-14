import { useEffect, useState } from "react";
import { subscribeToasts } from "./toast";

const TYPE_ICONS = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "!",
};

export function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToasts((event) => {
      if (event.kind === "add") {
        const entry = event.entry;
        setToasts((prev) => [...prev, entry]);
        if (entry.duration > 0) {
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== entry.id));
          }, entry.duration);
        }
        return;
      }

      if (event.kind === "update") {
        setToasts((prev) => prev.map((t) => (t.id === event.id ? { ...t, ...event.patch } : t)));
        if (event.patch.duration > 0) {
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== event.id));
          }, event.patch.duration);
        }
      }
    });
    return unsubscribe;
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

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
