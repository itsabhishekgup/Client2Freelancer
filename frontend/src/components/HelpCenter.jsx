import { useState } from "react";

const ROLES = [
  {
    id: "client",
    label: "I'm a Client",
    icon: "👤",
    tagline: "Hiring someone? You create the escrow and release funds when the work is done.",
    steps: [
      {
        title: "1 · Create the escrow",
        body: "Enter the freelancer's wallet address and the agreed USDC amount, then hit Create Escrow. You'll get an escrow ID — keep it.",
      },
      {
        title: "2 · Approve & deposit USDC",
        body: "Approve the contract to spend your USDC, then deposit. Now the money is locked on-chain — nobody can touch it but the contract.",
      },
      {
        title: "3 · Freelancer submits work",
        body: "Wait for the freelancer to mark the work as done. You can verify the delivery outside the chain.",
      },
      {
        title: "4 · Approve work & release",
        body: "Happy with the result? Approve the work and release funds — USDC goes straight to the freelancer. Disagree? Raise a dispute instead.",
      },
    ],
    tips: [
      "Funds are only released when YOU approve — the freelancer can't take them.",
      "If the escrow expires and work was never submitted, you can cancel and get a full refund.",
    ],
  },
  {
    id: "freelancer",
    label: "I'm a Freelancer",
    icon: "🧑‍💻",
    tagline: "Getting paid for work? The escrow guarantees the client's funds are real and locked.",
    steps: [
      {
        title: "1 · Share your wallet address",
        body: "Give the client your address. They create the escrow and lock the USDC — you can verify the funds are really there in My Escrows.",
      },
      {
        title: "2 · Deliver the work",
        body: "Complete the work, then hit Submit Work. This tells the chain you're done and starts the client's review window.",
      },
      {
        title: "3 · Client approves or disputes",
        body: "If the client is happy, they approve and funds are released to you. If they dispute, an arbitrator decides.",
      },
      {
        title: "4 · Claim if they go silent",
        body: "Approved but funds stuck? Release them yourself. If the client never approves and the escrow expires after you submitted work, you can claim after expiry.",
      },
    ],
    tips: [
      "The client can't run away with the money — it's locked on-chain until released or disputed.",
      "After you submit work, the client has until expiry to approve. After that, you can claim.",
    ],
  },
];

const FAQ = [
  {
    q: "What is an escrow?",
    a: "A smart contract that holds USDC until both parties agree the work is done. Neither side can spend the funds alone — release, refund, and arbitration are all handled on-chain.",
  },
  {
    q: "Who pays the gas fees?",
    a: "Each transaction (create, deposit, submit, approve, release) is paid by whoever sends it, in USDC — Arc's native gas token. Testnet USDC is free from the Circle faucet.",
  },
  {
    q: "What happens if the client never approves?",
    a: "Every escrow has an expiry (default 7 days). If the freelancer submitted work and the client doesn't approve, the freelancer can claim the funds after expiry. If work was never submitted, the client can cancel and get a full refund.",
  },
  {
    q: "How do disputes work?",
    a: "Either party can raise a dispute, which locks the funds. A designated arbitrator (set by the contract owner) reviews the case and resolves in favor of the client or the freelancer.",
  },
  {
    q: "Is this real money?",
    a: "No — this runs on Arc Testnet with free testnet USDC. It demonstrates the full production flow (real transactions, real contract, real arbitration) so you can build on it safely.",
  },
];

const STATUS_LEGEND = [
  { label: "Waiting", className: "waiting", desc: "Created, but funds not deposited yet." },
  { label: "Funded", className: "funded", desc: "USDC locked in the contract." },
  { label: "Work Submitted", className: "submitted", desc: "Freelancer marked the work as done." },
  { label: "Approved", className: "approved", desc: "Client approved the work." },
  { label: "Completed", className: "completed", desc: "Funds released to the freelancer." },
  { label: "Refunded", className: "refunded", desc: "Client got the funds back." },
  { label: "Disputed", className: "disputed", desc: "Locked — awaiting arbitrator decision." },
];

function HelpCenter({ onNavigate }) {
  const [role, setRole] = useState("client");
  const [openFaq, setOpenFaq] = useState(0);
  const activeRole = ROLES.find((r) => r.id === role) ?? ROLES[0];

  return (
    <main className="dashboard help-page">
      <section className="dashboard-header">
        <div className="theme-badge">Arc Network • Help Center</div>
        <h1>Help Center</h1>
        <p className="dashboard-lead">A 2-minute guide to escrows on ArcBridge.</p>
      </section>

      <button
        type="button"
        className="help-cta help-back-btn"
        onClick={() => onNavigate?.("dashboard")}
      >
        ← Back to Dashboard
      </button>

      <section className="card dashboard-section help-center">

      {/* Role picker */}
      <div className="help-role-picker">
        {ROLES.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`help-role-tab ${role === r.id ? "active" : ""}`}
            onClick={() => setRole(r.id)}
          >
            <span className="help-role-icon" aria-hidden="true">
              {r.icon}
            </span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      <div className="help-role-panel">
        <p className="help-role-tagline">{activeRole.tagline}</p>

        <div className="help-steps">
          {activeRole.steps.map((step) => (
            <div key={step.title} className="help-step">
              <div className="help-step-title">{step.title}</div>
              <p>{step.body}</p>
            </div>
          ))}
        </div>

        <div className="help-tips">
          {activeRole.tips.map((tip) => (
            <div key={tip} className="help-tip">
              <span aria-hidden="true">✓</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>

        <div className="help-actions">
          <button type="button" className="help-cta" onClick={() => onNavigate?.("create-escrow")}>
            Create your first escrow
          </button>
          <button type="button" className="help-cta" onClick={() => onNavigate?.("my-escrows")}>
            View live escrows
          </button>
        </div>
      </div>

      {/* FAQ */}
      <div className="help-faq">
        <h4>Frequently asked questions</h4>
        {FAQ.map((item, index) => (
          <div key={item.q} className={`help-faq-item ${openFaq === index ? "open" : ""}`}>
            <button
              type="button"
              className="help-faq-question"
              onClick={() => setOpenFaq(openFaq === index ? -1 : index)}
              aria-expanded={openFaq === index}
            >
              <span>{item.q}</span>
              <span className="help-faq-chevron" aria-hidden="true">
                {openFaq === index ? "−" : "+"}
              </span>
            </button>
            {openFaq === index && <div className="help-faq-answer">{item.a}</div>}
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="help-status-legend">
        <h4>Escrow statuses at a glance</h4>
        <div className="help-status-grid">
          {STATUS_LEGEND.map((s) => (
            <div key={s.label} className="help-status-item">
              <span className={`status-badge ${s.className}`}>{s.label}</span>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>
      </section>
    </main>
  );
}

export default HelpCenter;
