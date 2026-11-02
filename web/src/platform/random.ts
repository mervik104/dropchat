import type { RandomSource } from "../lib/identity";

export const browserRandom: RandomSource = {
  uuid: () => crypto.randomUUID(),
  bytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
};
