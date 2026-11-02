import type { PeerSummary } from "@dropchat/shared";

import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { PlatformGlyph } from "../../ui/icons";

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
      <div className="flex items-center justify-between px-1">
        <h2
          id="requests-heading"
          className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Запросы
        </h2>
        <span className="text-2xs font-medium tabular-nums text-muted">
          {requests.length}
        </span>
      </div>

      <ul className="mt-2 space-y-2">
        {requests.map((peer) => (
          <li
            key={peer.id}
            className="rounded-card border border-accent/20 bg-accent-soft/60 p-3"
          >
            <div className="flex items-center gap-3">
              <Avatar
                name={peer.name}
                seed={peer.id}
                size="sm"
                online={peer.online}
                icon={<PlatformGlyph platform={peer.platform} size={14} />}
                decorative
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {peer.name}
                </p>
                <p className="truncate text-xs text-muted">
                  Хочет подключиться
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button
                size="sm"
                fullWidth
                onClick={() => onRespond(peer.id, true)}
              >
                Принять
              </Button>
              <Button
                size="sm"
                variant="secondary"
                fullWidth
                onClick={() => onRespond(peer.id, false)}
              >
                Отклонить
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
