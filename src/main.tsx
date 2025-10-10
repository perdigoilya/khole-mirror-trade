import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { KalshiProvider } from "./contexts/KalshiContext";

createRoot(document.getElementById("root")!).render(
  <KalshiProvider>
    <App />
  </KalshiProvider>
);
