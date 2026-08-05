function ProgressStepper({ currentStep = 0 }) {
  const steps = [
    "Create Escrow",
    "Approve USDC",
    "Deposit Funds",
    "Submit Work",
    "Approve Work",
    "Release Funds",
  ];

  const activeStep = Math.min(Math.max(Number(currentStep) || 0, 0), steps.length - 1);

  return (
    <section className="card progress-stepper" aria-label="Escrow progress">
      <div className="progress-stepper-header">
        <div>
          <h3>Escrow Progress</h3>
          <p>Secure • Transparent • Decentralized</p>
        </div>
      </div>

      <div className="progress-track">
        {steps.map((step, index) => {
          let state = "pending";
          if (index < activeStep) state = "completed";
          else if (index === activeStep) state = "active";

          return (
            <div key={step} className={`progress-step ${state}`}>
              <div className="progress-circle">{index + 1}</div>
              <span className="progress-label">{step}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ProgressStepper;
