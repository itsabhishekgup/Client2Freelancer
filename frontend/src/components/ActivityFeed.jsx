import { useState } from "react";
import ActivityItem from "./ActivityItem";

// Show the most recent activities first; older ones stay behind "Show more"
// so the desktop feed stays compact without dropping any history.
const INITIAL_VISIBLE = 3;
const LOAD_STEP = 3;

function ActivityFeed({ activityItems, feedLoading }) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const visible = activityItems.slice(0, visibleCount);
  const hasMore = visibleCount < activityItems.length;

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
        <>
          <div className="activity-feed-list">
            {visible.map((item) => (
              <ActivityItem key={item.key} item={item} />
            ))}
          </div>

          {hasMore && (
            <div style={{ textAlign: "center", marginTop: "14px" }}>
              <button
                type="button"
                className="premium-action-btn premium-action-btn--load-more"
                onClick={() => setVisibleCount((count) => count + LOAD_STEP)}
              >
                Show more ({activityItems.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </>
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
