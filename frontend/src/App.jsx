import "./styles/globals.css";
import "./styles/dashboard.css";

import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";

function App() {
  return (
    <div className="app">
      <Navbar />

      <div className="app-layout">
        <Sidebar />
        <Dashboard />
      </div>
    </div>
  );
}

export default App;