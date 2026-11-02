import type { P2PFileMeta, P2PFileSink } from "../lib/p2p";

export async function createBrowserSink(
  meta: P2PFileMeta,
): Promise<P2PFileSink> {
  const chunks: BlobPart[] = [];

  return {
    async write(chunk: Uint8Array): Promise<void> {
      chunks.push(chunk as unknown as BlobPart);
    },

    async close(): Promise<void> {
      const blob = new Blob(chunks, { type: meta.mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = meta.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },

    async abort(): Promise<void> {
      chunks.length = 0;
    },
  };
}
