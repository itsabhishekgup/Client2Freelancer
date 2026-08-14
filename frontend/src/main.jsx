import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";
import { Providers } from "./Providers";
import { Toaster } from "./lib/Toaster";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Providers>
      <App />
      <Toaster />
    </Providers>
  </StrictMode>,
);
