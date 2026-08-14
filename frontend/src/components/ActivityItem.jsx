import { shortenAddress } from "../lib/escrowFormat";

const TONE_BG = {
  completed: "rgba(34,197,94,0.14)",
  funded: "rgba(59,130,246,0.14)",
  submitted: "rgba(249,115,22,0.14)",
  approved: "rgba(139,92,246,0.14)",
  disputed: "rgba(239,68,68,0.14)",
  cancelled: "rgba(250,204,21,0.14)",
};

const TONE_COLOR = {
  completed: "#16a34a",
  funded: "#2563eb",
  submitted: "#ea580c",
  approved: "#7c3aed",
  disputed: "#dc2626",
  cancelled: "#ca8a04",
};

function ActivityItem({ item }) {
  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "14px",
        alignItems: "center",
        padding: "14px 16px",
        borderRadius: "18px",
        background: "rgba(255,255,255,0.74)",
        border: "1px solid rgba(148,163,184,0.14)",
        boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "14px",
          display: "grid",
          placeItems: "center",
          background: TONE_BG[item.tone] ?? "rgba(37,99,235,0.14)",
          color: TONE_COLOR[item.tone] ?? "#1d4ed8",
          fontSize: "18px",
          fontWeight: 800,
        }}
      >
        {item.icon}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <strong style={{ color: "#0f172a", fontSize: "14px" }}>{item.label}</strong>
          <span className={`status-badge ${item.tone}`} style={{ padding: "6px 10px" }}>
            Escrow #{item.escrowId}
          </span>
        </div>
        <p
          style={{
            margin: "4px 0 0",
            color: "#64748b",
            fontSize: "13px",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {item.detail}
        </p>
      </div>

      <div style={{ textAlign: "right", minWidth: "120px" }}>
        <div style={{ color: "#0f172a", fontSize: "12px", fontWeight: 700 }}>{item.timeAgo}</div>
        <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>
          {shortenAddress(item.txHash)}
        </div>
      </div>
    </article>
  );
}

export default ActivityItem;
