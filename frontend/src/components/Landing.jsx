function ShowcaseWindow({ title, children }) {
  return (
    <div className="showcase-window">
      <div className="showcase-window-bar">
        <span className="showcase-dot" />
        <span className="showcase-dot" />
        <span className="showcase-dot" />
        <span className="showcase-window-title">{title}</span>
      </div>
      <div className="showcase-body">{children}</div>
    </div>
  );
}

function AnalyticsMock() {
  return (
    <ShowcaseWindow title="analytics/dashboard">
      <div className="mock-stat-row">
        <div className="mock-stat">
          <span>Locked USDC</span>
          <strong>$12,840</strong>
        </div>
        <div className="mock-stat">
          <span>Active</span>
          <strong>38</strong>
        </div>
        <div className="mock-stat">
          <span>Released</span>
          <strong>$9,210</strong>
        </div>
      </div>
      <div className="mock-bars">
        <div className="mock-bar" style={{ height: "38%" }} />
        <div className="mock-bar" style={{ height: "56%" }} />
        <div className="mock-bar" style={{ height: "44%" }} />
        <div className="mock-bar" style={{ height: "72%" }} />
        <div className="mock-bar" style={{ height: "58%" }} />
        <div className="mock-bar" style={{ height: "88%" }} />
        <div className="mock-bar" style={{ height: "66%" }} />
      </div>
    </ShowcaseWindow>
  );
}

function CreateEscrowMock() {
  return (
    <ShowcaseWindow title="escrow/create">
      <div className="mock-form">
        <div className="mock-input" />
        <div className="mock-input mock-input--short" />
        <div className="mock-input" />
        <div className="mock-btn" />
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <span className="status-badge funded">Approve USDC</span>
        <span className="status-badge approved">Deposit Funds</span>
      </div>
    </ShowcaseWindow>
  );
}

function EscrowDetailsMock() {
  return (
    <ShowcaseWindow title="escrow/42">
      <div className="mock-summary-row">
        <span>Escrow ID</span>
        <strong>#42</strong>
      </div>
      <div className="mock-summary-row">
        <span>Client</span>
        <strong>0x36a7...0279</strong>
      </div>
      <div className="mock-summary-row">
        <span>Freelancer</span>
        <strong>0xb8C4...71f2</strong>
      </div>
      <div className="mock-summary-row">
        <span>Amount</span>
        <strong>2.50 USDC</strong>
      </div>
      <div style={{ marginTop: "6px" }}>
        <span className="status-badge completed">● Work Approved</span>
      </div>
    </ShowcaseWindow>
  );
}

function ActivityMock() {
  return (
    <ShowcaseWindow title="activity/live">
      {["✨", "💰", "🚀"].map((icon, i) => (
        <div key={i} className="mock-feed-row">
          <div className="mock-feed-ic">{icon}</div>
          <div className="mock-feed-lines">
            <i />
            <i />
          </div>
          <span className="status-badge live" style={{ fontSize: "10px", padding: "4px 8px" }}>
            Live
          </span>
        </div>
      ))}
    </ShowcaseWindow>
  );
}

function Landing({ onLaunch }) {
  return (
    <div className="landing">
      <div className="landing-inner">
        <nav className="landing-nav">
          <div className="landing-logo">
            <img src="/arc-logo.svg" alt="Arc logo" />
            <div>
              <h2>Client2Freelancer</h2>
              <p>Escrow on Arc</p>
            </div>
          </div>

          <div className="landing-nav-actions">
            <button
              type="button"
              className="landing-cta-ghost"
              onClick={() => onLaunch?.("analytics")}
            >
              View Analytics
            </button>
            <button type="button" className="landing-cta-primary" onClick={() => onLaunch?.()}>
              Launch App
            </button>
          </div>
        </nav>

        <section className="landing-hero">
          <span className="landing-hero-badge">
            <span className="landing-hero-dot" /> Live on Arc Testnet
          </span>
          <h1>
            Trustless escrow payments, <span className="grad">powered by Arc</span>
          </h1>
          <p className="landing-hero-lead">
            Lock USDC, deliver work, release funds — all on-chain with cancel, dispute, and
            arbitration built in. No middlemen, no trust required.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-cta-primary" onClick={() => onLaunch?.()}>
              Launch App →
            </button>
            <button
              type="button"
              className="landing-cta-ghost"
              onClick={() => onLaunch?.("my-escrows")}
            >
              Browse Escrows
            </button>
          </div>
        </section>

        <section className="showcase">
          <div className="showcase-head">
            <h2>Everything in one place</h2>
            <p>A complete Web3 escrow workspace — analytics, creation, details, and live activity.</p>
          </div>

          <div className="showcase-grid">
            <div className="showcase-tile">
              <AnalyticsMock />
              <div className="showcase-caption">
                <h3>Analytics Dashboard</h3>
                <p>Live totals for locked, active, and released USDC with a real-time volume chart.</p>
              </div>
            </div>

            <div className="showcase-tile">
              <CreateEscrowMock />
              <div className="showcase-caption">
                <h3>Create Escrow</h3>
                <p>One-click escrow creation with USDC approval and funding in a single flow.</p>
              </div>
            </div>

            <div className="showcase-tile">
              <EscrowDetailsMock />
              <div className="showcase-caption">
                <h3>Escrow Details</h3>
                <p>Full transparency — client, freelancer, amount, and status straight from the chain.</p>
              </div>
            </div>

            <div className="showcase-tile">
              <ActivityMock />
              <div className="showcase-caption">
                <h3>Live Activity</h3>
                <p>Every create, deposit, submit, release, cancel, and dispute as it lands on-chain.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-cctp">
          <div className="landing-cctp-head">
            <span className="status-badge live">Powered by Circle CCTP</span>
            <h2>Fund your escrow from any chain</h2>
            <p>
              Bridge USDC from Base Sepolia or Ethereum Sepolia straight into an escrow. Circle's
              CCTP burns USDC on the source chain and mints it natively on Arc — no manual
              bridging, no wrapped tokens, no liquidity pools.
            </p>
          </div>

          <div className="landing-cctp-flow">
            <div className="landing-cctp-node">
              <span className="landing-cctp-node-icon" aria-hidden="true">🟦</span>
              <strong>Base Sepolia</strong>
              <small>Burn USDC</small>
            </div>
            <span className="landing-cctp-arrow" aria-hidden="true">→</span>
            <div className="landing-cctp-node landing-cctp-node--mid">
              <span className="landing-cctp-node-icon" aria-hidden="true">🔄</span>
              <strong>CCTP Attestation</strong>
              <small>~30-60 seconds</small>
            </div>
            <span className="landing-cctp-arrow" aria-hidden="true">→</span>
            <div className="landing-cctp-node">
              <span className="landing-cctp-node-icon" aria-hidden="true">⛓️</span>
              <strong>Arc Testnet</strong>
              <small>Mint USDC</small>
            </div>
            <span className="landing-cctp-arrow" aria-hidden="true">→</span>
            <div className="landing-cctp-node landing-cctp-node--done">
              <span className="landing-cctp-node-icon" aria-hidden="true">✅</span>
              <strong>Escrow Funded</strong>
              <small>Auto-deposit</small>
            </div>
          </div>

          <button
            type="button"
            className="landing-cta-primary"
            onClick={() => onLaunch?.("create-escrow")}
          >
            Try It Now →
          </button>
        </section>

        <section className="landing-features">
          <div className="landing-feature">
            <h3>On-chain custody</h3>
            <p>Funds sit in a smart contract, never with a counterparty. Release only when both sides agree.</p>
          </div>
          <div className="landing-feature">
            <h3>Dispute &amp; arbitration</h3>
            <p>Raise disputes, lock funds, and let a designated arbitrator resolve in favor of either party.</p>
          </div>
          <div className="landing-feature">
            <h3>Expiry timelocks</h3>
            <p>Cancel or claim after expiry — stale escrows never trap funds forever.</p>
          </div>
        </section>

        <footer className="landing-footer">
          <button
            type="button"
            className="landing-cta-primary"
            onClick={() => onLaunch?.()}
            style={{ marginBottom: "18px" }}
          >
            Launch the App →
          </button>
          <br />
          Client2Freelancer Escrow · Built on Arc Network · Powered by Circle USDC
          <span className="landing-footer-sep" aria-hidden="true"> · </span>
          <button type="button" className="landing-footer-link" onClick={() => onLaunch?.("why-arc")}>
            Why Arc?
          </button>
        </footer>
      </div>
    </div>
  );
}

export default Landing;
