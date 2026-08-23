// Mobile-only bottom navigation bar. Rendered by App on every app view but
// hidden by CSS on desktop (visible only at the mobile breakpoint).
// Each tab maps to its own mobile page inside Dashboard:
//   Home → progress + create + fund    Wallet → wallet overview
//   Escrows → my escrows list          Activity → recent activity
//   Transactions → tx history
const BOTTOM_NAV_ITEMS = [
  { id: "dashboard", icon: "🏠", label: "Home" },
  { id: "wallet", icon: "💼", label: "Wallet" },
  { id: "my-escrows", icon: "📦", label: "Escrows" },
  { id: "activity", icon: "🕘", label: "Activity" },
  { id: "transactions", icon: "💸", label: "Txn" },
];

function BottomNav({ activeSection = "dashboard", onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {BOTTOM_NAV_ITEMS.map((item) => {
        const active = activeSection === item.id;

        return (
          <button
            key={item.id}
            type="button"
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate?.(item.id)}
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
