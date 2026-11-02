import type { PeerSummary } from "@dropchat/shared";

export interface IncomingRequestsProps {
  requests: PeerSummary[];
  onRespond: (peerId: string, accept: boolean) => void;
}

export function IncomingRequests({
  requests,
  onRespond,
}: IncomingRequestsProps) {
  if (requests.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="requests-heading" className="mt-6">
      <h2
        id="requests-heading"
        className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
      >
        Запросы
      </h2>
      <ul className="mt-2 space-y-1">
        {requests.map((peer) => (
          <li
            key={peer.id}
            className="rounded-xl bg-white p-3 dark:bg-stone-900"
          >
            <p className="truncate text-sm font-medium">{peer.name}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onRespond(peer.id, true)}
                className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Принять
              </button>
              <button
                type="button"
                onClick={() => onRespond(peer.id, false)}
                className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium dark:border-stone-700"
              >
                Отклонить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
