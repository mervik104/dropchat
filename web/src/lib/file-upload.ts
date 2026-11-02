import type { ChatMessage } from "@dropchat/shared";

import { ApiError, UploadOffsetError } from "./api";

export interface UploadFileLike {
  name: string;
  size: number;
  type: string;
  slice(start: number, end: number): Blob;
}

export interface FileUploadApi {
  initFile(
    input: {
      name: string;
      size: number;
      mime: string;
      peerId: string;
      fileId?: string;
    },
    signal?: AbortSignal,
  ): Promise<{ fileId: string; partSize: number }>;
  putFilePart(
    fileId: string,
    partNumber: number,
    chunk: Blob,
    contentRange: string,
    signal?: AbortSignal,
  ): Promise<{
    status: "incomplete" | "done";
    uploadedBytes: number;
  }>;
  getFileState(
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{
    fileId: string;
    uploadedBytes: number;
    partSize: number;
    state: string;
  }>;
  completeFile(fileId: string, signal?: AbortSignal): Promise<ChatMessage>;
  cancelFile(fileId: string): Promise<void>;
}

interface UploadOptions {
  file: UploadFileLike;
  peerId: string;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  sleep: (ms: number) => Promise<void>;
  random?: () => number;
}

const MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

export async function uploadFile(
  api: FileUploadApi,
  options: UploadOptions,
): Promise<ChatMessage> {
  const requestedFileId = crypto.randomUUID();
  let fileId: string = requestedFileId;
  let initialized = false;

  try {
    const init = await api.initFile({
      name: options.file.name,
      size: options.file.size,
      mime: options.file.type || "application/octet-stream",
      peerId: options.peerId,
      fileId: requestedFileId,
    });
    fileId = init.fileId;
    initialized = true;

    return await runUpload(api, {
      ...options,
      fileId,
      partSize: init.partSize,
      uploadedBytes: 0,
      random: options.random ?? Math.random,
    });
  } catch (error) {
    if (initialized) {
      await cancelIfAborted(api, fileId, options.signal);
    } else {
      await cancelFileQuietly(api, fileId);
    }
    throw error;
  }
}

export async function resumeUpload(
  api: FileUploadApi,
  options: Omit<UploadOptions, "peerId"> & { fileId: string },
): Promise<ChatMessage> {
  const state = await api.getFileState(options.fileId, options.signal);
  if (state.state !== "uploading") {
    throw new Error("upload_not_resumable");
  }

  return runUpload(api, {
    ...options,
    partSize: state.partSize,
    uploadedBytes: state.uploadedBytes,
    random: options.random ?? Math.random,
  });
}

async function runUpload(
  api: FileUploadApi,
  options: {
    file: UploadFileLike;
    signal: AbortSignal;
    onProgress: (percent: number) => void;
    sleep: (ms: number) => Promise<void>;
    random: () => number;
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
          options.signal,
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
        const cap = Math.min(
          RETRY_MAX_MS,
          RETRY_BASE_MS * 2 ** (attempt - 1),
        );
        const backoff = Math.round(cap / 2 + options.random() * (cap / 2));
        const retryAfter =
          error instanceof ApiError
            ? Math.min(error.retryAfterMs, RETRY_MAX_MS)
            : 0;
        await sleep(Math.max(backoff, retryAfter));
        if (options.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
      }
    }
  }

  if (options.signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
  return api.completeFile(options.fileId, options.signal);
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
  if (!signal.aborted) {
    return;
  }
  await cancelFileQuietly(api, fileId);
}

async function cancelFileQuietly(
  api: FileUploadApi,
  fileId: string,
): Promise<void> {
  try {
    await api.cancelFile(fileId);
  } catch {
    // The upload already failed; cleanup errors must not mask the cause.
  }
}
