import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";
import { createIdentityStore } from "./lib/identity";
import { loadWorkspace as bootstrapWorkspace } from "./lib/workspace";
import { browserRandom } from "./platform/random";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const identityStore = createIdentityStore(localStorage);

const loadWorkspace = () =>
  bootstrapWorkspace({
    store: identityStore,
    random: browserRandom,
    fetchImpl: fetch,
    apiUrl,
    name: "Моё устройство",
    platform: "web",
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App loadWorkspace={loadWorkspace} />
  </StrictMode>,
);
