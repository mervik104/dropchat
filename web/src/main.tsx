import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { UpdateDeviceRequest } from "@dropchat/shared";

import { App } from "./App";
import "./index.css";
import { createApiClient } from "./lib/api";
import {
  createIdentityStore,
  parseIdentityExport,
  type DeviceIdentity,
} from "./lib/identity";
import { connectRealtime as openRealtime } from "./lib/socket";
import { loadWorkspace as bootstrapWorkspace } from "./lib/workspace";
import { browserRandom } from "./platform/random";
import { requestPersistentStorage } from "./platform/storage";
import { createBrowserWebSocket } from "./platform/websocket";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const identityStore = createIdentityStore(localStorage);

const apiFor = (identity: DeviceIdentity) =>
  createApiClient(fetch, apiUrl, identity);

const loadWorkspace = () =>
  bootstrapWorkspace({
    store: identityStore,
    random: browserRandom,
    fetchImpl: fetch,
    apiUrl,
    name: "Моё устройство",
    platform: "web",
  });

const saveProfile = async (
  identity: DeviceIdentity,
  patch: UpdateDeviceRequest,
) => {
  const profile = await apiFor(identity).updateDevice(patch);
  await identityStore.save({
    ...identity,
    name: profile.name,
    invisible: profile.invisible,
  });
  return profile;
};

const importIdentity = async (text: string) => {
  await identityStore.save(parseIdentityExport(text));
};

const resetIdentity = () => identityStore.clear();

void requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App
      loadWorkspace={loadWorkspace}
      saveProfile={saveProfile}
      resetIdentity={resetIdentity}
      importIdentity={importIdentity}
      loadMessages={(identity, peerId, before) =>
        apiFor(identity).getMessages(peerId, before)
      }
      sendText={(identity, peerId, text, clientId) =>
        apiFor(identity).sendText(peerId, text, clientId)
      }
      connectRealtime={(identity, onEvent, onReconnect) =>
        openRealtime({
          api: apiFor(identity),
          apiUrl,
          fallbackOrigin: window.location.origin,
          createWebSocket: createBrowserWebSocket,
          onEvent,
          onReconnect,
        })
      }
      refreshPeers={(identity) => apiFor(identity).getPeers()}
      requestPeer={(identity, peerId) => apiFor(identity).requestPeer(peerId)}
      respondPeer={(identity, fromDeviceId, accept) =>
        apiFor(identity).respondPeer(fromDeviceId, accept)
      }
      createInvite={(identity) => apiFor(identity).createInvite()}
      redeemInvite={(identity, code) => apiFor(identity).redeemInvite(code)}
      unlinkPeer={(identity, peerId) => apiFor(identity).unlinkPeer(peerId)}
      blockPeer={(identity, peerId) => apiFor(identity).blockPeer(peerId)}
      createLocalId={() => browserRandom.uuid()}
      now={() => Date.now()}
    />
  </StrictMode>,
);
