import { useEffect, useState } from "react";
import "./styles/globals.css";
import "./styles/dashboard.css";
import "./styles/dark-theme.css";
import "./styles/safety-center.css";
import "./styles/force-mobile.css"; // mobile-browser "Desktop site" mode fix

import Landing from "./components/Landing";
import Navbar from "./components/Navbar";
import Settings from "./components/Settings";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import HelpCenter from "./components/HelpCenter";
import WhyArc from "./components/WhyArc";
import AnalyticsPanel from "./components/AnalyticsPanel";
import SafetyCenter from "./components/SafetyCenter";
import ForceMobileBanner from "./components/ForceMobileBanner";
import ChatWidget from "./components/ChatWidget";

function App() {
  const [view, setView] = useState("landing"); // "landing" | "app"
  const [activeSection, setActiveSection] = useState("dashboard");
  const [currentStep, setCurrentStep] = useState(0);
  const [escrowId, setEscrowId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accent, setAccent] = useState(
    () => localStorage.getItem("arcbridge-accent") || "blue",
  );
  const [refreshMs, setRefreshMs] = useState(
    () => Number(localStorage.getItem("arcbridge-refresh") || 30000),
  );
  const [compact, setCompact] = useState(
    () => localStorage.getItem("arcbridge-compact") === "1",
  );
  const [defaultExpiryDays, setDefaultExpiryDays] = useState(
    () => Number(localStorage.getItem("arcbridge-expiry-days") || 0),
  );
  const [showActivityFeed, setShowActivityFeed] = useState(
    () => localStorage.getItem("arcbridge-show-feed") !== "0",
  );
  const [forceMobile, setForceMobile] = useState(
    () => localStorage.getItem("arcbridge-force-mobile") !== "0",
  );

  // Live-switch the force-mobile class from the Settings toggle (no reload).
  // On a real desktop / normal mobile this is a no-op by design.
  const handleSetForceMobile = (value) => {
    setForceMobile(value);
    localStorage.setItem("arcbridge-force-mobile", value ? "1" : "0");
    if (typeof window !== "undefined" && window.__arcApplyForceMobile) {
      window.__arcApplyForceMobile(value);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("arcbridge-accent", accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.dataset.density = compact ? "compact" : "default";
    localStorage.setItem("arcbridge-compact", compact ? "1" : "0");
  }, [compact]);

  useEffect(() => {
    localStorage.setItem("arcbridge-refresh", String(refreshMs));
  }, [refreshMs]);

  useEffect(() => {
    localStorage.setItem("arcbridge-expiry-days", String(defaultExpiryDays));
  }, [defaultExpiryDays]);

  useEffect(() => {
    localStorage.setItem("arcbridge-show-feed", showActivityFeed ? "1" : "0");
  }, [showActivityFeed]);

  const handleLaunch = (section) => {
    setView("app");
    if (section) {
      setActiveSection(section);
    }
  };

  // "settings" opens the settings modal; "help-center" is its own page;
  // every other section scrolls to the matching dashboard section.
  const handleNavigate = (section) => {
    if (section === "settings") {
      setSettingsOpen(true);
      return;
    }
    setActiveSection(section);
  };

  const isHelpPage = view === "app" && activeSection === "help-center";
  const isWhyArcPage = view === "app" && activeSection === "why-arc";
  const isAnalyticsPage = view === "app" && activeSection === "analytics";
  const isSafetyPage = view === "app" && activeSection === "safety-center";

  const settingsProps = {
    accent,
    setAccent,
    refreshMs,
    setRefreshMs,
    compact,
    setCompact,
    defaultExpiryDays,
    setDefaultExpiryDays,
    showActivityFeed,
    setShowActivityFeed,
    forceMobile,
    setForceMobile: handleSetForceMobile,
  };

  if (view === "landing") {
    return (
      <>
        <Landing onLaunch={handleLaunch} />
        <ForceMobileBanner />
        <ChatWidget />
      </>
    );
  }

  return (
    <>
      <div className="app-shell">
      <Navbar onNavigate={handleNavigate} />

      <div className="app-layout">
        <Sidebar activeSection={activeSection} onNavigate={handleNavigate} />

        {isHelpPage ? (
          <HelpCenter onNavigate={handleNavigate} />
        ) : isWhyArcPage ? (
          <WhyArc onNavigate={handleNavigate} />
        ) : isSafetyPage ? (
          <SafetyCenter onNavigate={handleNavigate} />
        ) : isAnalyticsPage ? (
          <main className="dashboard">
            <section id="analytics" className="dashboard-header analytics-page-header">
              <h1>Escrow Analytics</h1>
              <p className="dashboard-lead">
                Live on-chain statistics — volume, statuses, and top parties.
              </p>
            </section>
            <AnalyticsPanel />
          </main>
        ) : (
          <Dashboard
            activeSection={activeSection}
            onNavigate={handleNavigate}
            currentStep={currentStep}
            setCurrentStep={setCurrentStep}
            escrowId={escrowId}
            setEscrowId={setEscrowId}
            refreshMs={refreshMs}
            defaultExpiryDays={defaultExpiryDays}
            showActivityFeed={showActivityFeed}
          />
        )}
      </div>

      {settingsOpen && (
        <div
          className="settings-modal-overlay"
          role="presentation"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-modal-head">
              <h3>⚙️ Settings</h3>
              <button
                type="button"
                className="settings-modal-close"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>
            <Settings {...settingsProps} />
          </div>
        </div>
      )}
      </div>
      <ForceMobileBanner />
      <ChatWidget />
    </>
  );
}

export default App;
