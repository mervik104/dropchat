import type { ChatMessage } from "@dropchat/shared";

import { ApiError, UploadOffsetError } from "./api";

export interface UploadFileLike {
  name: string;
  size: number;
  type: string;
  slice(start: number, end: number): Blob;
}

export interface FileUploadApi {
  initFile(input: {
    name: string;
    size: number;
    mime: string;
    peerId: string;
  }): Promise<{ fileId: string; partSize: number }>;
  putFilePart(
    fileId: string,
    partNumber: number,
    chunk: Blob,
    contentRange: string,
  ): Promise<{
    status: "incomplete" | "done";
    uploadedBytes: number;
  }>;
  getFileState(fileId: string): Promise<{
    fileId: string;
    uploadedBytes: number;
    partSize: number;
    state: string;
  }>;
  completeFile(fileId: string): Promise<ChatMessage>;
  cancelFile(fileId: string): Promise<void>;
}

interface UploadOptions {
  file: UploadFileLike;
  peerId: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  sleep: (ms: number) => Promise<void>;
}

const MAX_ATTEMPTS = 3;

export async function uploadFile(
  api: FileUploadApi,
  options: UploadOptions,
): Promise<ChatMessage> {
  let fileId = "";

  try {
    const init = await api.initFile({
      name: options.file.name,
      size: options.file.size,
      mime: options.file.type || "application/octet-stream",
      peerId: options.peerId,
    });
    fileId = init.fileId;

    return await runUpload(api, {
      ...options,
      fileId,
      partSize: init.partSize,
      uploadedBytes: 0,
    });
  } catch (error) {
    await cancelIfAborted(api, fileId, options.signal);
    throw error;
  }
}

export async function resumeUpload(
  api: FileUploadApi,
  options: Omit<UploadOptions, "peerId"> & { fileId: string },
): Promise<ChatMessage> {
  const state = await api.getFileState(options.fileId);
  if (state.state !== "uploading") {
    throw new Error("upload_not_resumable");
  }

  return runUpload(api, {
    ...options,
    partSize: state.partSize,
    uploadedBytes: state.uploadedBytes,
  });
}

async function runUpload(
  api: FileUploadApi,
  options: {
    file: UploadFileLike;
    signal: AbortSignal;
    onProgress: (percent: number) => void;
    sleep: (ms: number) => Promise<void>;
    fileId: string;
    partSize: number;
    uploadedBytes: number;
  },
): Promise<ChatMessage> {
  const sleep = options.sleep;
  let offset = options.uploadedBytes;
  const partSize = options.partSize;

  uploadLoop: while (offset < options.file.size) {
    if (options.signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const start = offset;
    const end = Math.min(start + partSize, options.file.size);
    const chunk = options.file.slice(start, end);
    const partNumber = Math.floor(start / partSize) + 1;
    const contentRange = `bytes ${start}-${end - 1}/${options.file.size}`;
    let attempt = 0;

    while (true) {
      try {
        const result = await api.putFilePart(
          options.fileId,
          partNumber,
          chunk,
          contentRange,
        );
        offset = result.uploadedBytes;
        options.onProgress(Math.round((offset / options.file.size) * 100));
        break;
      } catch (error) {
        if (options.signal.aborted) {
          throw error;
        }
        if (error instanceof UploadOffsetError) {
          offset = error.uploadedBytes;
          options.onProgress(
            Math.round((offset / options.file.size) * 100),
          );
          continue uploadLoop;
        }
        attempt += 1;
        if (!isRetryable(error) || attempt >= MAX_ATTEMPTS) {
          throw error;
        }
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }

  return api.completeFile(options.fileId);
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return true;
  }
  return (
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    error.status >= 500
  );
}

async function cancelIfAborted(
  api: FileUploadApi,
  fileId: string,
  signal: AbortSignal,
): Promise<void> {
  if (!fileId || !signal.aborted) {
    return;
  }

  try {
    await api.cancelFile(fileId);
  } catch {
    // The upload already failed; cleanup errors must not mask the cause.
  }
}
