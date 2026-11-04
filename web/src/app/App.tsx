import { useMessengerApp } from "../hooks/useMessengerApp";
import { ChatListPanel } from "../features/chat-list/ChatListPanel";
import { Conversation } from "../features/conversation/Conversation";
import { EmptyConversation } from "../features/conversation/EmptyConversation";
import { InviteDialog } from "../features/invite/InviteDialog";
import { SettingsDialog } from "../features/settings/SettingsDialog";
import { ErrorScreen } from "../features/status/ErrorScreen";
import { LoadingScreen } from "../features/status/LoadingScreen";
import { ConnectionBadge } from "../features/status/ConnectionBadge";
import { NotificationBanner } from "../features/status/NotificationBanner";
import { AppShell } from "./AppShell";
import type { AppProps } from "./types";

export type { AppProps } from "./types";

export function App(props: AppProps) {
  const app = useMessengerApp(props);

  if (app.state.status === "loading") {
    return <LoadingScreen />;
  }

  if (app.state.status === "error") {
    return (
      <ErrorScreen
        kind={app.state.kind}
        onRetry={app.start}
        onResetIdentity={app.handleResetIdentity}
        onImportIdentity={app.handleImportIdentity}
      />
    );
  }

  const { identity } = app.state.workspace;
  const selectedPeer = app.selectedPeer;

  return (
    <AppShell
      hasSelection={Boolean(selectedPeer)}
      notification={
        app.notification ? (
          <NotificationBanner
            message={app.notification}
            onDismiss={() => app.setNotification(null)}
          />
        ) : null
      }
      connectionIndicator={
        app.connectionState === "online" ? null : (
          <ConnectionBadge state={app.connectionState} />
        )
      }
      sidebar={
        <ChatListPanel
          deviceName={identity.name}
          peers={app.peers}
          messagesByPeer={app.messagesByPeer}
          currentDeviceId={identity.deviceId}
          unreadByPeer={app.unreadByPeer}
          sentRequests={app.sentRequests}
          hasSelection={Boolean(selectedPeer)}
          connectionState={app.connectionState}
          onOpenSettings={() => app.setSettingsOpen(true)}
          onOpenInvite={() => app.setInviteOpen(true)}
          onSelectPeer={app.selectPeer}
          onRequestPeer={(peerId) => void app.sendPeerRequest(peerId)}
          onRespondRequest={(peerId, accept) =>
            void app.respondToRequest(peerId, accept)
          }
          onRefresh={() => void app.reloadPeers()}
        />
      }
      conversation={
        selectedPeer ? (
          <Conversation
            currentDeviceId={identity.deviceId}
            peer={selectedPeer}
            messages={app.messagesByPeer[selectedPeer.id]!}
            nextBefore={app.nextBeforeByPeer[selectedPeer.id] ?? null}
            loading={app.loadingMessagesFor === selectedPeer.id}
            error={app.messagesErrorFor === selectedPeer.id}
            onBack={() => app.setSelectedPeerId(null)}
            onLoadMore={(before) =>
              void app.loadOlderMessages(selectedPeer.id, before)
            }
            onSend={(text) => app.sendMessage(selectedPeer.id, text)}
            onRetry={(message) => app.retryMessage(selectedPeer.id, message)}
            menuOpen={app.chatMenuOpen}
            onToggleMenu={() =>
              app.setChatMenuOpen((current) => !current)
            }
            onCloseMenu={() => app.setChatMenuOpen(false)}
            onUnlink={() => app.unlinkChat(selectedPeer.id)}
            uploads={app.uploads.filter(
              (upload) => upload.peerId === selectedPeer.id,
            )}
            onAttach={(files) => app.handleUploads(files, selectedPeer.id)}
            onCancelUpload={(id) => app.cancelUpload(id)}
            onDownload={app.handleDownload}
            onDelete={(message) =>
              app.deleteMessage(selectedPeer.id, message)
            }
            now={props.now}
          />
        ) : (
          <EmptyConversation />
        )
      }
      overlays={
        <>
          {app.settingsOpen ? (
            <SettingsDialog
              identity={identity}
              onClose={() => app.setSettingsOpen(false)}
              onSave={app.handleSaveProfile}
              onImportIdentity={app.handleImportIdentity}
            />
          ) : null}

          {app.inviteOpen ? (
            <InviteDialog
              onClose={() => app.setInviteOpen(false)}
              onCreate={() => props.createInvite(identity)}
              onRedeem={app.redeemInviteCode}
            />
          ) : null}
        </>
      }
    />
  );
}
