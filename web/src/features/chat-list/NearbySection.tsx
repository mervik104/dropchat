import type { PeerSummary } from "@dropchat/shared";

import { Avatar } from "../../ui/Avatar";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { IconButton } from "../../ui/IconButton";
import {
  CheckIcon,
  PlatformGlyph,
  RadarIcon,
  RetryIcon,
} from "../../ui/icons";

export interface NearbySectionProps {
  peers: PeerSummary[];
  sentRequests: Record<string, boolean>;
  onRequestPeer: (peerId: string) => void;
  onRefresh: () => void;
}

export function NearbySection({
  peers,
  sentRequests,
  onRequestPeer,
  onRefresh,
}: NearbySectionProps) {
  return (
    <section aria-labelledby="nearby-heading">
      <div className="flex items-center gap-1 px-1">
        <h2
          id="nearby-heading"
          className="flex-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted"
        >
          Рядом
        </h2>
        <span className="text-2xs font-medium tabular-nums text-muted">
          {peers.length}
        </span>
        <IconButton
          label="Обновить"
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          className="-mr-1.5 size-8"
        >
          <RetryIcon size={16} />
        </IconButton>
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
        <ul className="mt-1.5 space-y-0.5">
          {peers.map((peer) => {
            const sent = sentRequests[peer.id] === true;
            return (
              <li
                key={peer.id}
                className="flex items-center gap-2.5 rounded-card px-2.5 py-2 transition-colors hover:bg-elevated"
              >
                <Avatar
                  name={peer.name}
                  seed={peer.id}
                  size="md"
                  online={peer.online}
                  icon={<PlatformGlyph platform={peer.platform} size={16} />}
                  decorative
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">
                    {peer.name}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {peer.online ? "онлайн" : "офлайн"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={sent ? "soft" : "secondary"}
                  disabled={sent}
                  aria-label={`Отправить запрос ${peer.name}`}
                  onClick={() => onRequestPeer(peer.id)}
                  leadingIcon={sent ? <CheckIcon size={15} /> : undefined}
                  className="shrink-0"
                >
                  {sent ? "Отправлено" : "Запрос"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
