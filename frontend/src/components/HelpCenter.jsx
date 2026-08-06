function HelpCenter() {
  return (
    <section id="help-center" className="card help-center">
      <div className="summary-header">
        <div>
          <h3>Help Center</h3>
          <p>Need guidance while using the escrow flow?</p>
        </div>

        <span className="status-badge live">Live</span>
      </div>

      <div className="help-columns">
        <div className="help-section">
          <h4>Escrow Flow</h4>
          <ol>
            <li>Create Escrow</li>
            <li>Approve USDC</li>
            <li>Deposit Funds</li>
            <li>Submit Work</li>
            <li>Approve Work</li>
            <li>Release Funds</li>
          </ol>
        </div>

        <div className="help-section">
          <h4>Quick Tips</h4>
          <ul>
            <li>Always verify the freelancer wallet address.</li>
            <li>Approve USDC before depositing funds.</li>
            <li>Deposit locks funds inside the escrow contract.</li>
            <li>Release Funds should only be clicked after work approval.</li>
          </ul>
        </div>

        <div className="help-section">
          <h4>Common Issues</h4>
          <ul>
            <li>Deposit failed → Check USDC approval.</li>
            <li>Submit failed → Connect freelancer wallet.</li>
            <li>Release failed → Approve work first.</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export default HelpCenter;
