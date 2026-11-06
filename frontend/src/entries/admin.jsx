import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ErrorBoundary from "../components/ErrorBoundary.jsx";
import Admin from "../pages/Admin.jsx";
import "../styles/admin.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <Admin />
    </ErrorBoundary>
  </StrictMode>
);
