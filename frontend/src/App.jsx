import { useState } from "react";
import "./styles/globals.css";
import "./styles/dashboard.css";

import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";

function App() {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [currentStep, setCurrentStep] = useState(0);
  const [escrowId, setEscrowId] = useState("");

  return (
    <div className="app-shell">
      <Navbar onNavigate={setActiveSection} />

      <div className="app-layout">
        <Sidebar activeSection={activeSection} onNavigate={setActiveSection} />

        <Dashboard
          activeSection={activeSection}
          onNavigate={setActiveSection}
          currentStep={currentStep}
          setCurrentStep={setCurrentStep}
          escrowId={escrowId}
          setEscrowId={setEscrowId}
        />
      </div>
    </div>
  );
}

export default App;
