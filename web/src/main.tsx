import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";
import { createHealthClient } from "./lib/health";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const healthClient = createHealthClient(fetch, apiUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App healthClient={healthClient} />
  </StrictMode>,
);
