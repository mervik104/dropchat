import {
  createOfflineSession,
  type OfflineSession,
  type OfflineSessionEvents,
} from "../lib/offline-session";
import { createBrowserSink } from "./download-sink";
import { createOfflineRtcSession } from "./webrtc";

export function createBrowserOfflineSession(
  events: OfflineSessionEvents,
): OfflineSession {
  return createOfflineSession({
    createSession: createOfflineRtcSession,
    createSink: createBrowserSink,
    ...events,
  });
}
