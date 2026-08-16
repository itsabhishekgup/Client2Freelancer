import { useEffect, useState } from "react";

const DISMISS_KEY = "arcbridge-fm-dismissed";

function isForceMobile() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("force-mobile")
  );
}

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Shown only when a phone is in mobile-browser "Desktop site" mode (the
 * detection script in index.html adds the `force-mobile` class to <html>).
 * Tells the user the app is intentionally showing the mobile layout, so they
 * know why the desktop-ish URL is rendering as it is. Dismissible, and
 * auto-hides after a few seconds. Never renders on real desktop or normal
 * mobile (no class = nothing).
 */
export default function ForceMobileBanner() {
  const [active, setActive] = useState(isForceMobile);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setActive(isForceMobile());
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const visible = active && !dismissed;

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => setDismissed(true), 8000);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="force-mobile-banner" role="status">
      <span className="force-mobile-banner-icon" aria-hidden="true">
        📱
      </span>
      <p>Desktop site mode on hai — mobile layout dikh raha hai</p>
      <button
        type="button"
        className="force-mobile-banner-close"
        aria-label="Dismiss notification"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
