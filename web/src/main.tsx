import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { UpdateDeviceRequest } from "@dropchat/shared";

import { App } from "./app/App";
import "./index.css";
import { createApiClient } from "./lib/api";
import {
  createIdentityStore,
  parseIdentityExport,
  type DeviceIdentity,
} from "./lib/identity";
import { createLocalMessageStore } from "./lib/local-messages";
import { connectRealtime as openRealtime } from "./lib/socket";
import { createP2PManager as buildP2PManager } from "./lib/p2p-manager";
import { loadWorkspace as bootstrapWorkspace } from "./lib/workspace";
import { uploadFile } from "./lib/file-upload";
import { createBrowserSink } from "./platform/download-sink";
import { openExternalUrl } from "./platform/open";
import { browserRandom } from "./platform/random";
import { requestPersistentStorage } from "./platform/storage";
import { createBrowserWebSocket } from "./platform/websocket";
import { createBrowserRtcSession } from "./platform/webrtc";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const identityStore = createIdentityStore(localStorage);
const localMessageStore = createLocalMessageStore(localStorage);

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
      uploadFile={(identity, file, peerId, onProgress, signal) =>
        uploadFile(apiFor(identity), {
          file,
          peerId,
          signal,
          onProgress,
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        })
      }
      sendP2PFileMeta={(identity, peerId, meta) =>
        apiFor(identity).sendP2PFileMeta(peerId, meta)
      }
      localMessageStore={localMessageStore}
      createP2PManager={({
        sendSignal,
        onFileReceived,
        onTextReceived,
        localDeviceId,
      }) =>
        buildP2PManager({
          createSession: createBrowserRtcSession,
          sendSignal,
          createSink: createBrowserSink,
          onFileReceived,
          onTextReceived,
          localDeviceId,
        })
      }
      downloadFile={(identity, fileId) =>
        apiFor(identity).createFileLink(fileId)
      }
      openUrl={openExternalUrl}
      createLocalId={() => browserRandom.uuid()}
      now={() => Date.now()}
    />
  </StrictMode>,
);
