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
    <article className="escrow-row-glass activity-item">
      <div
        className="activity-item-icon"
        style={{
          background: TONE_BG[item.tone] ?? "rgba(37,99,235,0.14)",
          color: TONE_COLOR[item.tone] ?? "#1d4ed8",
        }}
      >
        {item.icon}
      </div>

      <div className="activity-item-body">
        <div className="activity-item-title-row">
          <strong className="escrow-row-title">{item.label}</strong>
          <span className={`status-badge ${item.tone}`}>Escrow #{item.escrowId}</span>
        </div>
        <p className="escrow-row-sub activity-item-detail">{item.detail}</p>
      </div>

      <div className="activity-item-meta">
        <div className="escrow-row-title activity-item-time">{item.timeAgo}</div>
        <div className="escrow-row-sub activity-item-hash">
          {shortenAddress(item.txHash)}
        </div>
      </div>
    </article>
  );
}

export default ActivityItem;
