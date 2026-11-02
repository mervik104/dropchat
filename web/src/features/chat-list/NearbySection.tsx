import type { PeerSummary } from "@dropchat/shared";

import { onlineDotClass } from "./onlineDotClass";

export interface NearbySectionProps {
  peers: PeerSummary[];
  sentRequests: Record<string, boolean>;
  onRequestPeer: (peerId: string) => void;
}

export function NearbySection({
  peers,
  sentRequests,
  onRequestPeer,
}: NearbySectionProps) {
  return (
    <section aria-labelledby="nearby-heading">
      <h2
        id="nearby-heading"
        className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
      >
        Рядом
      </h2>
      {peers.length === 0 ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-4 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
          Рядом пока никого
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {peers.map((peer) => (
            <li
              key={peer.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white dark:hover:bg-stone-900"
            >
              <span
                aria-label={peer.online ? "онлайн" : "офлайн"}
                className={onlineDotClass(peer)}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {peer.name}
              </span>
              <button
                type="button"
                aria-label={`Отправить запрос ${peer.name}`}
                onClick={() => onRequestPeer(peer.id)}
                disabled={sentRequests[peer.id] === true}
                className="rounded-full border border-sky-300 px-2.5 py-1 text-xs font-medium text-sky-700 disabled:opacity-60 dark:border-sky-800 dark:text-sky-300"
              >
                {sentRequests[peer.id] === true ? "Отправлено" : "Запрос"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
