import { useState } from "react";
import { arcTestnet } from "../contracts/arcChain";
import { CONTRACT_ADDRESS } from "../contracts/config";

const ACCENTS = [
  { id: "blue", label: "Neon Blue", color: "#4f7cff" },
  { id: "cyan", label: "Cyan", color: "#22d3ee" },
  { id: "emerald", label: "Emerald", color: "#34d399" },
  { id: "amber", label: "Amber", color: "#fbbf24" },
];

const REFRESH_OPTIONS = [
  { value: 0, label: "Off (manual)" },
  { value: 15000, label: "Every 15s" },
  { value: 30000, label: "Every 30s" },
  { value: 60000, label: "Every 60s" },
];

const EXPIRY_OPTIONS = [
  { value: 0, label: "Contract default" },
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

function Settings({
  theme,
  setTheme,
  accent,
  setAccent,
  refreshMs,
  setRefreshMs,
  compact,
  setCompact,
  defaultExpiryDays,
  setDefaultExpiryDays,
  showActivityFeed,
  setShowActivityFeed,
}) {
  const [copied, setCopied] = useState("");

  const handleCopy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1600);
    } catch {
      // Clipboard may be blocked; silently ignore.
    }
  };

  const rpcUrl = arcTestnet.rpcUrls.default.http[0];

  const copyRows = [
    { key: "contract", label: "Contract", value: CONTRACT_ADDRESS },
    { key: "rpc", label: "RPC", value: rpcUrl },
    { key: "chain", label: "Chain ID", value: String(arcTestnet.id) },
  ];

  return (
    <section id="settings" className="card dashboard-section">
      <div className="summary-header">
        <div>
          <h3>⚙️ Settings</h3>
          <p>Appearance, data refresh, and network info</p>
        </div>
      </div>

      <div className="settings-group">
        <h4>Appearance — Theme</h4>
        <p className="settings-hint">
          Switch between the futuristic dark theme and the Soft Light Silver Aurora
          glassmorphism theme. Applied instantly and saved to this browser.
        </p>
        <div className="accent-swatches">
          <button
            type="button"
            className={`accent-swatch ${theme === "dark" ? "accent-swatch--active" : ""}`}
            onClick={() => setTheme("dark")}
            aria-label="Set theme to Dark"
            aria-pressed={theme === "dark"}
          >
            <span className="accent-swatch-dot" style={{ "--swatch": "#0f172a" }} />
            Dark
          </button>
          <button
            type="button"
            className={`accent-swatch ${theme === "aurora" ? "accent-swatch--active" : ""}`}
            onClick={() => setTheme("aurora")}
            aria-label="Set theme to Soft Light Silver Aurora"
            aria-pressed={theme === "aurora"}
          >
            <span className="accent-swatch-dot" style={{ "--swatch": "#c0c8d8" }} />
            Silver Aurora
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h4>Appearance — Accent Color</h4>
        <p className="settings-hint">
          Choose the neon accent used across buttons, badges, and highlights. Applied
          instantly and saved to this browser.
        </p>
        <div className="accent-swatches">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`accent-swatch ${accent === a.id ? "accent-swatch--active" : ""}`}
              style={{ "--swatch": a.color }}
              onClick={() => setAccent(a.id)}
              aria-label={`Set accent to ${a.label}`}
              aria-pressed={accent === a.id}
            >
              <span className="accent-swatch-dot" />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <h4>Data Refresh</h4>
        <p className="settings-hint">
          Auto-refresh the escrow list, wallet balance, and activity feed on an interval
          while the app is open. On by default (every 30s).
        </p>
        <div className="settings-row">
          <span>Auto-refresh</span>
          <select
            className="settings-select"
            value={refreshMs}
            onChange={(e) => setRefreshMs(Number(e.target.value))}
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h4>Layout — Card Density</h4>
        <p className="settings-hint">
          Compact mode tightens card padding and spacing so more escrows fit on screen.
        </p>
        <div className="settings-row">
          <span>Compact cards</span>
          <button
            type="button"
            role="switch"
            aria-checked={compact}
            className={`toggle-switch ${compact ? "toggle-switch--on" : ""}`}
            onClick={() => setCompact(!compact)}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h4>Escrow Defaults</h4>
        <p className="settings-hint">
          Expiry duration applied to newly created escrows. Overrides the contract default
          until changed.
        </p>
        <div className="settings-row">
          <span>Expiry duration</span>
          <select
            className="settings-select"
            value={defaultExpiryDays}
            onChange={(e) => setDefaultExpiryDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="settings-group">
        <h4>Content</h4>
        <p className="settings-hint">
          Show or hide the live activity feed on the dashboard.
        </p>
        <div className="settings-row">
          <span>Activity feed</span>
          <button
            type="button"
            role="switch"
            aria-checked={showActivityFeed}
            className={`toggle-switch ${showActivityFeed ? "toggle-switch--on" : ""}`}
            onClick={() => setShowActivityFeed(!showActivityFeed)}
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-group">
        <h4>Network Info</h4>
        <p className="settings-hint">The chain this app reads live data from. Copy any value with one tap.</p>
        <div className="info-copy">
          {copyRows.map((row) => (
            <div key={row.key}>
              <span>{row.label}</span>
              <code title={row.value}>{row.value}</code>
              <button
                type="button"
                className="copy-btn"
                onClick={() => handleCopy(row.key, row.value)}
              >
                {copied === row.key ? "✓ Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Settings;
