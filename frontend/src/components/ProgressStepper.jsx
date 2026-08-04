function ProgressStepper({ currentStep }) {
  const steps = [
    "Create Escrow",
    "Approve USDC",
    "Deposit Funds",
    "Submit Work",
    "Approve Work",
    "Release Funds",
  ];

  return (
    <div className="card progress-stepper">

      <h3>🚀 Escrow Progress</h3>

      <p className="progress-subtitle">
        Secure • Transparent • Decentralized
      </p>

      <div className="progress-line">

        {steps.map((step, index) => {

          let status = "";

          if (index < currentStep) {
            status = "completed";
          } else if (index === currentStep) {
            status = "active";
          }

          return (
            <div
              key={index}
              className={"progress-item " + status}
            >
              <div className="progress-circle">
                {index + 1}
              </div>

              <span>{step}</span>
            </div>
          );
        })}

      </div>

    </div>
  );
}

export default ProgressStepper;