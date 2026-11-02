import type { P2PFileMeta, P2PFileSink } from "../lib/p2p";

interface OpfsSink {
  directory: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
}

export async function createBrowserSink(
  meta: P2PFileMeta,
): Promise<P2PFileSink> {
  const chunks: BlobPart[] = [];
  let opfs: OpfsSink | null = null;

  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle("dropchat-downloads", {
      create: true,
    });
    const name = `${crypto.randomUUID()}.bin`;
    const handle = await directory.getFileHandle(name, { create: true });
    opfs = {
      directory,
      handle,
      writable: await handle.createWritable(),
    };
  } catch {
    opfs = null;
  }

  return {
    async write(chunk: Uint8Array): Promise<void> {
      if (opfs) {
        await opfs.writable.write(chunk as unknown as BufferSource);
      } else {
        chunks.push(chunk as unknown as BlobPart);
      }
    },

    async close(): Promise<void> {
      let blob: Blob;
      if (opfs) {
        await opfs.writable.close();
        blob = await opfs.handle.getFile();
      } else {
        blob = new Blob(chunks, { type: meta.mime });
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = meta.name;
      anchor.click();

      const current = opfs;
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (current) {
          void current.directory
            .removeEntry(current.handle.name)
            .catch(() => undefined);
        }
      }, 60_000);
    },

    async abort(): Promise<void> {
      chunks.length = 0;
      if (opfs) {
        await opfs.writable.abort().catch(() => undefined);
        await opfs.directory
          .removeEntry(opfs.handle.name)
          .catch(() => undefined);
        opfs = null;
      }
    },
  };
}
