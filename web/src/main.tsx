import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./app/globals.css";

const ThermalMap = lazy(() => import("./app/ThermalMap"));

function App() {
  return (
    <Suspense fallback={null}>
      <ThermalMap />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
