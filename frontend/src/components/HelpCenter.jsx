function HelpCenter() {
  return (
    <div className="card help-center">
      <h3>Need Help?</h3>

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
  );
}

export default HelpCenter;