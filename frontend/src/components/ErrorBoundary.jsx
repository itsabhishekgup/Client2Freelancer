import { Component } from "react";

// Top-level error boundary. A crash in any child (render or lifecycle) is
// caught here and shown as a recoverable error screen instead of unmounting
// the whole app (white screen). "Try again" resets the tree — the app keeps
// working for non-crashing features.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error, info) {
    console.error("App error boundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#0b0f1a",
            color: "#e2e8f0",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            padding: "24px",
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              textAlign: "center",
              background: "#131a2b",
              border: "1px solid #1e2126",
              borderRadius: "14px",
              padding: "32px 28px",
            }}
          >
            <div style={{ fontSize: "40px", lineHeight: 1 }} aria-hidden="true">
              ⚠️
            </div>
            <h1 style={{ fontSize: "20px", margin: "16px 0 8px" }}>Something went wrong</h1>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "14px",
                lineHeight: 1.5,
                margin: "0 0 8px",
                wordBreak: "break-word",
              }}
            >
              {this.state.message || "An unexpected error occurred."}
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                marginTop: "16px",
                padding: "10px 20px",
                border: "none",
                borderRadius: "10px",
                background: "#5e6ad2",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
