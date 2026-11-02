import type { PeerSummary } from "@dropchat/shared";

export function onlineDotClass(peer: PeerSummary): string {
  return [
    "h-2.5 w-2.5 shrink-0 rounded-full",
    peer.online ? "bg-emerald-500" : "bg-stone-400 dark:bg-stone-600",
  ].join(" ");
}
