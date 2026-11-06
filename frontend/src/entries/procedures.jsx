import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import Procedures from "../pages/Procedures.jsx";
import "../styles/styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <Procedures />
    </ErrorBoundary>
  </StrictMode>
);
