import type { PeerSummary } from "@dropchat/shared";

import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { CheckIcon, PlatformGlyph, RadarIcon } from "../../ui/icons";

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
      <div className="flex items-center justify-between px-1">
        <h2
          id="nearby-heading"
          className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Рядом
        </h2>
        <span className="text-2xs font-medium tabular-nums text-muted">
          {peers.length}
        </span>
      </div>

      {peers.length === 0 ? (
        <EmptyState
          compact
          className="mt-2 rounded-card border border-dashed border-border bg-surface/60"
          icon={<RadarIcon />}
          title="Рядом пока никого"
          description="Устройства появятся здесь, когда откроют DropChat."
        />
      ) : (
        <div className="dc-scroll-contain -mx-1 mt-2 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {peers.map((peer) => {
            const sent = sentRequests[peer.id] === true;
            return (
              <div
                key={peer.id}
                className="flex w-[148px] shrink-0 snap-start flex-col items-center gap-2 rounded-card border border-border bg-surface p-3 text-center shadow-soft"
              >
                <Avatar
                  name={peer.name}
                  seed={peer.id}
                  size="lg"
                  online={peer.online}
                  icon={<PlatformGlyph platform={peer.platform} size={22} />}
                  decorative
                />
                <span className="w-full truncate text-sm font-semibold text-fg">
                  {peer.name}
                </span>
                <Button
                  size="sm"
                  variant={sent ? "soft" : "secondary"}
                  fullWidth
                  disabled={sent}
                  aria-label={`Отправить запрос ${peer.name}`}
                  onClick={() => onRequestPeer(peer.id)}
                  leadingIcon={sent ? <CheckIcon size={15} /> : undefined}
                >
                  {sent ? "Отправлено" : "Запрос"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
