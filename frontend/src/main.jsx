import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary";
import { Providers } from "./Providers";
import { Toaster } from "./lib/Toaster";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <App />
        <Toaster />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
