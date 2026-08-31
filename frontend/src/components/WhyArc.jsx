const HIGHLIGHTS = [
  {
    icon: "💵",
    title: "Pay fees in USDC, not gas tokens",
    body: "Arc runs on USDC as its native gas, so every escrow action costs a tiny, dollar-denominated fee. No volatile ETH to hold, no surprise gas spikes — just predictable dollars.",
  },
  {
    icon: "⚡",
    title: "Deterministic sub-second finality",
    body: "Deposits, approvals, and releases settle in under a second. Money moves the moment both parties agree — no waiting on confirmations to trust the outcome.",
  },
  {
    icon: "🔗",
    title: "EVM-compatible, instantly familiar",
    body: "Arc speaks Solidity and works with the wallets and tools you already use. Client2Freelancer runs on the same standard every developer already knows.",
  },
  {
    icon: "💱",
    title: "Built for stablecoin settlement",
    body: "An institutional-grade FX engine and native USDC make global, dollar-based payments and settlement a first-class feature — not an afterthought.",
  },
  {
    icon: "🛡️",
    title: "Secure on-chain custody",
    body: "Funds live in the escrow contract, verifiable at any time — never with a counterparty. Transparent by default, with opt-in privacy where it matters.",
  },
  {
    icon: "🏛️",
    title: "Built by Circle",
    body: "Arc is a Layer-1 blockchain from Circle, the team behind USDC — with full Circle platform integration for stablecoin finance.",
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

const CIRCLE_INTEGRATIONS = [
  {
    icon: "💵",
    title: "USDC native gas",
    body: "USDC is the network's own currency — every fee, deposit, and payout settles in USDC with no wrapping or bridge hop.",
  },
  {
    icon: "🔀",
    title: "CCTP cross-chain transfers",
    body: "Circle's Cross-Chain Transfer Protocol moves USDC natively between chains. Client2Freelancer uses it for 'Fund From Any Chain' — escrows funded straight from Base or Ethereum.",
  },
  {
    icon: "🏦",
    title: "Gateway unified balance",
    body: "Circle Gateway consolidates cross-chain USDC into one Arc balance for instant, low-cost payouts across supported networks.",
  },
  {
    icon: "🧰",
    title: "Circle developer platform",
    body: "Programmable wallets, Bridge Kit, and App Kit SDKs give builders a full toolkit — no custom bridge infrastructure required.",
  },
];

const ARCBRIDGE_TABLE = [
  { label: "Network", value: "Arc Testnet" },
  { label: "Chain ID", value: "5042002" },
  { label: "USDC decimals", value: "6" },
  { label: "Escrow contract", value: "0xa12b4775…65e4" },
  { label: "Explorer", value: "testnet.arcscan.app" },
  { label: "Type", value: "Stablecoin-native Layer 1 (EVM)" },
];

const REASONS = [
  {
    title: "Fees stay in dollars",
    body: "An escrow platform's costs should never swing with the crypto market. USDC-native gas means every action has a tiny, predictable dollar cost — for clients and freelancers alike.",
  },
  {
    title: "Fast finality = fast releases",
    body: "Sub-second finality means funds reach the freelancer almost the moment the client approves. Payments clear when they're meant to, not minutes later.",
  },
  {
    title: "Native USDC, zero bridges",
    body: "USDC is the network's own currency — no wrapped tokens, no bridge risk, no extra approval hop. Deposit and release USDC directly, securely.",
  },
  {
    title: "EVM = instant tooling",
    body: "Standard Solidity, standard wallets, standard explorers. Client2Freelancer runs on the same trusted stack every developer already knows.",
  },
];

function WhyArc({ onNavigate }) {
  return (
    <main className="dashboard help-page whyarc-page">
      <section className="dashboard-header">
        <div className="theme-badge">Arc Network • Why Arc</div>
        <h1>Payments that settle in dollars, on a chain built for it</h1>
        <p className="dashboard-lead">
          Client2Freelancer runs on Arc — a stablecoin-native Layer 1 from Circle. It's the
          reason escrow payments here are fast, predictable, and secure from start to finish.
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
            Instead of charging gas in a volatile native token, Arc runs on{" "}
            <strong>USDC as its native gas</strong> — so every fee is low, dollar-denominated,
            and predictable. Built by Circle, the company behind USDC, Arc is purpose-built for
            payments, settlement, and on-chain commerce. That's exactly what an escrow platform
            needs.
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
          <h4>Why Client2Freelancer chose Arc</h4>
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
            The short version: Arc is purpose-built for stablecoin payments, so the things an
            escrow platform cares about most — stable fees, fast finality, native USDC — are
            exactly what Arc optimizes for.
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

        <div className="whyarc-circle">
          <h4>Built on the Circle ecosystem</h4>
          <p className="whyarc-compare-note">
            Arc is Circle's Layer 1, so the full Circle platform is native here — and
            Client2Freelancer plugs straight into it.
          </p>
          <div className="whyarc-grid">
            {CIRCLE_INTEGRATIONS.map((c) => (
              <div key={c.title} className="whyarc-card">
                <span className="whyarc-card-icon" aria-hidden="true">
                  {c.icon}
                </span>
                <div>
                  <strong>{c.title}</strong>
                  <p>{c.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="whyarc-cctp-note">
            <span className="status-badge live">Live in Client2Freelancer</span>
            <strong>🌉 Fund From Any Chain — powered by Circle CCTP</strong>
            <p>
              Bridge USDC from Base Sepolia or Ethereum Sepolia straight into an escrow: CCTP
              burns on the source chain and mints natively on Arc, then Client2Freelancer
              auto-deposits into the escrow. No manual bridging, no wrapped tokens, no liquidity
              pools.
            </p>
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
          <h4>Client2Freelancer on Arc — live network details</h4>
          <div className="whyarc-table">
            {ARCBRIDGE_TABLE.map((row) => (
              <div key={row.label} className="whyarc-table-row">
                <span className="whyarc-table-label">{row.label}</span>
                <span className="whyarc-table-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="whyarc-closing">
          <p>
            Every escrow on Client2Freelancer is verifiable on-chain — funds held in a smart
            contract, deadlines enforced by code, and settlement in native USDC. Arc makes the
            whole experience fast, predictable, and built to be trusted.
          </p>
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
