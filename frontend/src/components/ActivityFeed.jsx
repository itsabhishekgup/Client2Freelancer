import ActivityItem from "./ActivityItem";

function ActivityFeed({ activityItems, feedLoading }) {
  return (
    <section id="activity" className="card activity-card">
      <div className="summary-header">
        <div>
          <h3>Recent Activity</h3>
          <p>Live blockchain events from the escrow contract</p>
        </div>
        <span className="status-badge live">Live</span>
      </div>

      {feedLoading && activityItems.length === 0 ? (
        <p className="section-copy">Loading live activity feed...</p>
      ) : activityItems.length ? (
        <div style={{ display: "grid", gap: "12px", marginTop: "6px" }}>
          {activityItems.map((item) => (
            <ActivityItem key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="activity-empty">
          <strong>No recent activity yet</strong>
          <p>
            Create, fund, submit, approve, and release an escrow to populate this section from
            blockchain events.
          </p>
        </div>
      )}
    </section>
  );
}

export default ActivityFeed;
