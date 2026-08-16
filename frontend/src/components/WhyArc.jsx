const HIGHLIGHTS = [
  {
    icon: "💵",
    title: "USDC is the native gas",
    body: "Every transaction fee is paid in USDC — dollar-denominated, low, and predictable. No volatile ETH/BTC gas to worry about, ever.",
  },
  {
    icon: "⚡",
    title: "Deterministic sub-second finality",
    body: "Transactions finalize in under a second, so escrow actions (deposit, approve, release) confirm almost instantly — no waiting for confirmations.",
  },
  {
    icon: "🔗",
    title: "EVM-compatible",
    body: "Arc speaks the same language as Ethereum — your Solidity contracts, wallets (MetaMask, OKX), and tooling all work as-is.",
  },
  {
    icon: "💱",
    title: "Built-in FX engine",
    body: "An institutional-grade RFQ system for stablecoin foreign exchange, purpose-built for global commerce and settlement.",
  },
  {
    icon: "🛡️",
    title: "Opt-in privacy",
    body: "Privacy features are available on demand — public by default, private when you need it. Full transparency where it matters.",
  },
  {
    icon: "🏛️",
    title: "Built by Circle",
    body: "Arc is an open Layer-1 blockchain from Circle, the team behind USDC. Full Circle platform integration for stablecoin finance.",
  },
];

const RESOURCES = [
  {
    label: "Arc — official website",
    url: "https://www.arc.io/",
    desc: "The Economic OS — stablecoin-native Layer 1 by Circle",
  },
  {
    label: "Arc documentation",
    url: "https://docs.arc.network/",
    desc: "Guides, RPC, chain info, and developer references",
  },
  {
    label: "Arc Testnet explorer",
    url: "https://testnet.arcscan.app/",
    desc: "Verify contracts, transactions, and blocks on ArcScan",
  },
  {
    label: "Arc faucet",
    url: "https://faucet.circle.com/",
    desc: "Free testnet USDC for building on Arc",
  },
  {
    label: "GitHub — Arc node",
    url: "https://github.com/circlefin/arc-node",
    desc: "Open-source Arc node — run your own, no permission needed",
  },
];

const COMPARISON = [
  {
    aspect: "Gas / fees",
    arc: "Paid in USDC — dollar-denominated, low, predictable",
    general: "Paid in ETH / native tokens — volatile crypto-denominated fees",
  },
  {
    aspect: "Finality",
    arc: "Deterministic sub-second finality",
    general: "Seconds to minutes, rollup-dependent",
  },
  {
    aspect: "Native settlement asset",
    arc: "USDC natively — no wrapping needed",
    general: "USDC usually bridged or wrapped (e.g. USDC.e)",
  },
  {
    aspect: "Bridge risk",
    arc: "None for USDC — it is the network's own currency",
    general: "Bridge / wrapping risk for stablecoins",
  },
  {
    aspect: "Purpose-built",
    arc: "Stablecoin finance, payments, settlement",
    general: "General-purpose dApps and DeFi",
  },
  {
    aspect: "Privacy",
    arc: "Opt-in privacy on demand",
    general: "Public-only by design",
  },
];

const ARCBRIDGE_TABLE = [
  { label: "Network", value: "Arc Testnet" },
  { label: "Chain ID", value: "5042002" },
  { label: "USDC decimals", value: "6" },
  { label: "Escrow contract", value: "0x788BD809…D0ff3" },
  { label: "Explorer", value: "testnet.arcscan.app" },
  { label: "Type", value: "Stablecoin-native Layer 1 (EVM)" },
];

const REASONS = [
  {
    title: "Fees stay in dollars",
    body: "An escrow platform's costs should never swing with the crypto market. Paying gas in USDC means every action has a tiny, predictable dollar cost.",
  },
  {
    title: "Fast finality = fast releases",
    body: "Sub-second finality means funds release to the freelancer almost the moment the client approves — the whole point of a payment platform.",
  },
  {
    title: "Native USDC, zero bridges",
    body: "USDC is the network's own currency — no wrapped tokens, no bridge risk, no extra approval hop. Deposit and release USDC directly.",
  },
  {
    title: "EVM = instant tooling",
    body: "Standard Solidity, standard wallets, standard explorers. ArcBridge runs on the same stack every developer already knows.",
  },
];

function WhyArc({ onNavigate }) {
  return (
    <main className="dashboard help-page whyarc-page">
      <section className="dashboard-header">
        <div className="theme-badge">Arc Network • Why Arc</div>
        <h1>Why Arc?</h1>
        <p className="dashboard-lead">
          ArcBridge is built on Arc — a stablecoin-native Layer 1 blockchain from Circle, the team behind USDC.
        </p>
      </section>

      <button
        type="button"
        className="help-cta help-back-btn"
        onClick={() => onNavigate?.("dashboard")}
      >
        ← Back to Dashboard
      </button>

      <section className="card dashboard-section help-center">
        <div className="whyarc-intro">
          <h4>What is Arc?</h4>
          <p>
            Arc is an open, EVM-compatible Layer 1 blockchain designed for stablecoin finance.
            Unlike general-purpose chains that charge gas in volatile tokens, Arc runs on{" "}
            <strong>USDC as its native gas</strong> — low, predictable, dollar-denominated fees.
            It's built by Circle, the company behind USDC, and targets payments, settlement,
            and on-chain commerce.
          </p>
        </div>

        <div className="whyarc-grid">
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} className="whyarc-card">
              <span className="whyarc-card-icon" aria-hidden="true">
                {h.icon}
              </span>
              <div>
                <strong>{h.title}</strong>
                <p>{h.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="whyarc-reasons">
          <h4>Why ArcBridge chose Arc</h4>
          <div className="whyarc-reasons-list">
            {REASONS.map((r) => (
              <div key={r.title} className="whyarc-reason">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="whyarc-compare">
          <h4>Arc vs general-purpose chains</h4>
          <p className="whyarc-compare-note">
            The short version: Arc is purpose-built for stablecoin payments, so the
            things an escrow platform cares about most — stable fees, fast finality,
            native USDC — are exactly what Arc optimizes for.
          </p>
          <div className="whyarc-compare-table">
            <div className="whyarc-compare-head">
              <span className="whyarc-compare-aspect">Aspect</span>
              <span className="whyarc-compare-arc">Arc</span>
              <span className="whyarc-compare-general">General-purpose chains</span>
            </div>
            {COMPARISON.map((row) => (
              <div key={row.aspect} className="whyarc-compare-row">
                <span className="whyarc-compare-aspect">{row.aspect}</span>
                <span className="whyarc-compare-arc">{row.arc}</span>
                <span className="whyarc-compare-general">{row.general}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="whyarc-resources">
          <h4>Arc resources</h4>
          <div className="whyarc-resources-list">
            {RESOURCES.map((r) => (
              <a
                key={r.url}
                className="whyarc-resource"
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="whyarc-resource-icon" aria-hidden="true">
                  ↗
                </span>
                <span className="whyarc-resource-copy">
                  <strong>{r.label}</strong>
                  <span>{r.desc}</span>
                </span>
              </a>
            ))}
          </div>
        </div>

        <div className="whyarc-network">
          <h4>ArcBridge on Arc — live network details</h4>
          <div className="whyarc-table">
            {ARCBRIDGE_TABLE.map((row) => (
              <div key={row.label} className="whyarc-table-row">
                <span className="whyarc-table-label">{row.label}</span>
                <span className="whyarc-table-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="help-actions">
          <button type="button" className="help-cta" onClick={() => onNavigate?.("create-escrow")}>
            Create an escrow on Arc
          </button>
          <button type="button" className="help-cta" onClick={() => onNavigate?.("dashboard")}>
            Back to the dashboard
          </button>
        </div>
      </section>
    </main>
  );
}

export default WhyArc;
