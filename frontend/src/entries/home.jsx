import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import Home from "../pages/Home.jsx";
import "../styles/styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <Home />
    </ErrorBoundary>
  </StrictMode>
);
