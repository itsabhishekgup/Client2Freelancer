import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ActivityFeed from "./ActivityFeed";

function makeItem(i) {
  return {
    key: `event-${i}`,
    label: `Event ${i}`,
    tone: "completed",
    icon: "•",
    escrowId: String(i),
    detail: `Detail ${i}`,
    timeAgo: `${i}m ago`,
    txHash: `0x${i}`,
  };
}

describe("ActivityFeed", () => {
  it("shows only the first 3 activities with a Show more button", () => {
    const items = [1, 2, 3, 4, 5, 6].map(makeItem);
    render(<ActivityFeed activityItems={items} feedLoading={false} />);

    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
    expect(screen.queryByText("Event 4")).not.toBeInTheDocument();
    expect(screen.getByText(/Show more \(3 remaining\)/)).toBeInTheDocument();
  });

  it("reveals more activities when Show more is clicked", () => {
    const items = [1, 2, 3, 4, 5, 6].map(makeItem);
    render(<ActivityFeed activityItems={items} feedLoading={false} />);

    fireEvent.click(screen.getByText(/Show more/));

    expect(screen.getByText("Event 4")).toBeInTheDocument();
    expect(screen.getByText("Event 5")).toBeInTheDocument();
    expect(screen.getByText("Event 6")).toBeInTheDocument();
    expect(screen.queryByText(/Show more/)).not.toBeInTheDocument();
  });

  it("does not render Show more when there are 3 or fewer items", () => {
    const items = [1, 2, 3].map(makeItem);
    render(<ActivityFeed activityItems={items} feedLoading={false} />);
    expect(screen.queryByText(/Show more/)).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no activities", () => {
    render(<ActivityFeed activityItems={[]} feedLoading={false} />);
    expect(screen.getByText("No recent activity yet")).toBeInTheDocument();
  });
});
