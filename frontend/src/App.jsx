import "./App.css" ;
import Navbar from "./components/Navbar";
import CreateEscrow from "./components/CreateEscrow";

function App() {
  return (
  <div className="container">
    <Navbar />

    <p>Secure USDC Escrow on Arc Network</p>

    <CreateEscrow />
  </div>
  );
}

export default App;