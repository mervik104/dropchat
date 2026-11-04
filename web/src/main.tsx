import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import type { UpdateDeviceRequest } from "@dropchat/shared";

import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import "./index.css";
import { createApiClient } from "./lib/api";
import {
  createIdentityStore,
  parseIdentityExport,
  type DeviceIdentity,
} from "./lib/identity";
import { createLocalMessageStore } from "./lib/local-messages";
import { createWorkspaceCache } from "./lib/workspace-cache";
import { connectRealtime as openRealtime } from "./lib/socket";
import { createP2PManager as buildP2PManager } from "./lib/p2p-manager";
import {
  loadWorkspace as bootstrapWorkspace,
  type Workspace,
} from "./lib/workspace";
import { uploadFile } from "./lib/file-upload";
import { createBrowserSink } from "./platform/download-sink";
import { playNotificationSound } from "./platform/notification-sound";
import { openExternalUrl } from "./platform/open";
import { browserRandom } from "./platform/random";
import { requestPersistentStorage } from "./platform/storage";
import { createBrowserWebSocket } from "./platform/websocket";
import { createBrowserRtcSession } from "./platform/webrtc";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const identityStore = createIdentityStore(localStorage);
const localMessageStore = createLocalMessageStore(localStorage);
const workspaceCache = createWorkspaceCache(localStorage);

const apiFor = (identity: DeviceIdentity) =>
  createApiClient(fetch, apiUrl, identity);

const loadWorkspace = async () => {
  const workspace = await bootstrapWorkspace({
    store: identityStore,
    random: browserRandom,
    fetchImpl: fetch,
    apiUrl,
    name: "Моё устройство",
    platform: "web",
  });
  workspaceCache.save(workspace);
  return workspace;
};

const loadCachedWorkspace = async (): Promise<Workspace | null> => {
  const identity = await identityStore.load();
  if (!identity) {
    return null;
  }
  const peers = workspaceCache.load(identity.deviceId);
  if (!peers) {
    return null;
  }
  const offline = <T extends { online: boolean }>(peer: T): T => ({
    ...peer,
    online: false,
  });
  return {
    identity,
    peers: {
      local: peers.local.map(offline),
      linked: peers.linked.map(offline),
      incomingRequests: peers.incomingRequests.map(offline),
    },
  };
};

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

const resetIdentity = async () => {
  localMessageStore.clearAll();
  workspaceCache.clearAll();
  await identityStore.clear();
};

void requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary onReset={() => window.location.reload()}>
      <App
      loadWorkspace={loadWorkspace}
      loadCachedWorkspace={loadCachedWorkspace}
      saveProfile={saveProfile}
      resetIdentity={resetIdentity}
      importIdentity={importIdentity}
      loadMessages={(identity, peerId, before) =>
        apiFor(identity).getMessages(peerId, before)
      }
      sendText={(identity, peerId, text, clientId) =>
        apiFor(identity).sendText(peerId, text, clientId)
      }
      deleteMessage={(identity, peerId, messageId) =>
        apiFor(identity).deleteMessage(peerId, messageId)
      }
      connectRealtime={(
        identity,
        onEvent,
        onReconnect,
        onUnavailable,
        onStateChange,
      ) =>
        openRealtime({
          api: apiFor(identity),
          apiUrl,
          fallbackOrigin: window.location.origin,
          createWebSocket: createBrowserWebSocket,
          onEvent,
          onReconnect,
          onUnavailable,
          onStateChange,
        })
      }
      refreshPeers={(identity, signal) => apiFor(identity).getPeers(signal)}
      requestPeer={(identity, peerId) => apiFor(identity).requestPeer(peerId)}
      respondPeer={(identity, fromDeviceId, accept) =>
        apiFor(identity).respondPeer(fromDeviceId, accept)
      }
      createInvite={(identity) => apiFor(identity).createInvite()}
      redeemInvite={(identity, code) => apiFor(identity).redeemInvite(code)}
      unlinkPeer={(identity, peerId) => apiFor(identity).unlinkPeer(peerId)}
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
      playNotificationSound={playNotificationSound}
      />
    </ErrorBoundary>
  </StrictMode>,
);
