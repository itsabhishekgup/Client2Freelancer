function Sidebar() {
  return (
    <aside className="sidebar">

      <div className="logo">
        <h2>🔷 Arc Escrow</h2>
        <p>Secure Payments</p>
      </div>

      <nav className="sidebar-menu">

        <button className="active">
          <span>🏠</span>
          Dashboard
        </button>

        <button>
          <span>➕</span>
          Create Escrow
        </button>

        <button>
          <span>📦</span>
          My Escrows
        </button>

        <button>
          <span>💸</span>
          Transactions
        </button>

        <button>
          <span>❓</span>
          Help Center
        </button>

        <button>
          <span>⚙️</span>
          Settings
        </button>

      </nav>

    </aside>
  );
}

export default Sidebar;