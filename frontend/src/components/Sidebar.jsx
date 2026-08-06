const NAV_ITEMS = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "create-escrow", icon: "➕", label: "Create Escrow" },
  { id: "my-escrows", icon: "📦", label: "My Escrows" },
  { id: "transactions", icon: "💸", label: "Transactions" },
  { id: "help-center", icon: "❓", label: "Help Center" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

function Sidebar({ activeSection = "dashboard", onNavigate }) {
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

      <div className="sidebar-footnote">
        <p>Arc Testnet</p>
        <strong>Powered by Circle</strong>
      </div>
    </aside>
  );
}

export default Sidebar;
