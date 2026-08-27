import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "analytics", icon: "📊", label: "Analytics" },
  { id: "create-escrow", icon: "➕", label: "Create Escrow" },
  { id: "my-escrows", icon: "📦", label: "My Escrows" },
  { id: "transactions", icon: "💸", label: "Transactions" },
  { id: "safety-center", icon: "🛡️", label: "Safety Center" },
  { id: "help-center", icon: "❓", label: "Help Center" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

// Mobile is chosen by EITHER a narrow layout viewport OR a real touch phone.
// "is-mobile-device" is set by index.html before first paint when
// navigator.maxTouchPoints + a small window.screen.width (or mobile UA) mark a
// genuine phone — this keeps the mobile drawer in Chrome/Safari "Desktop site"
// mode, where the viewport is widened to ~980px so max-width alone is wrong.
// Real desktop never gets the class, so its layout is untouched.
const isMobileViewport = () => {
  if (typeof window === "undefined") return false;
  if (document.documentElement.classList.contains("is-mobile-device")) {
    return true;
  }
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 768px)").matches
    : window.innerWidth <= 768;
};

function Sidebar({ activeSection = "dashboard", onNavigate }) {
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(isMobileViewport());
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  if (isMobile) {
    const drawerItems = NAV_ITEMS.filter((item) => item.id !== "help-center");
    const helpActive = activeSection === "help-center";

    return (
      <>
        <button
          type="button"
          className="mobile-menu-btn"
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>

        <button
          type="button"
          className={`mobile-sidebar-overlay ${menuOpen ? "open" : ""}`}
          aria-label="Close navigation menu"
          onClick={closeMenu}
        />

        <aside
          className={`mobile-sidebar ${menuOpen ? "open" : ""}`}
          aria-label="Primary navigation"
        >
          <div className="mobile-sidebar-header">
            <div className="logo-section mobile-logo-section">
              <img
                src="/arc-logo.svg"
                alt="Arc logo"
                className="brand-image brand-image--sidebar"
              />
              <div className="brand-copy">
                <h2>Client2Freelancer Escrow</h2>
                <p>Secure Payments on Arc</p>
              </div>
            </div>

            <button
              type="button"
              className="mobile-close-btn"
              aria-label="Close menu"
              onClick={closeMenu}
            >
              ×
            </button>
          </div>

          <div className="mobile-sidebar-body">
            <nav className="sidebar-menu mobile-sidebar-menu" aria-label="Primary navigation">
              {drawerItems.map((item) => {
                const active = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => {
                      onNavigate?.(item.id);
                      closeMenu();
                    }}
                  >
                    <span className="sidebar-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <button
              type="button"
              className={`mobile-help-button ${helpActive ? "active" : ""}`}
              onClick={() => {
                onNavigate?.("help-center");
                closeMenu();
              }}
            >
              <span className="sidebar-icon" aria-hidden="true">
                ❓
              </span>
              <span>Help Center</span>
            </button>

            <button
              type="button"
              className={`mobile-help-button whyarc-btn ${activeSection === "why-arc" ? "active" : ""}`}
              onClick={() => {
                onNavigate?.("why-arc");
                closeMenu();
              }}
            >
              <span className="sidebar-icon" aria-hidden="true">
                ⚡
              </span>
              <span>Why Arc?</span>
            </button>

            <div className="sidebar-footnote mobile-sidebar-footnote">
              <p>Arc Testnet</p>
              <strong>Powered by Circle</strong>
            </div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-menu" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const active = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={active ? "active" : ""}
              onClick={() => onNavigate?.(item.id)}
            >
              <span className="sidebar-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-whyarc">
        <button
          type="button"
          className={`sidebar-whyarc-btn ${activeSection === "why-arc" ? "active" : ""}`}
          onClick={() => onNavigate?.("why-arc")}
        >
          <span className="sidebar-icon" aria-hidden="true">
            ⚡
          </span>
          <span>Why Arc?</span>
        </button>
      </div>

      <div className="sidebar-footnote">
        <p>Arc Testnet</p>
        <strong>Powered by Circle</strong>
      </div>
    </aside>
  );
}

export default Sidebar;
