import type { ChatMessage } from "@dropchat/shared";
import { describe, expect, it, vi } from "vitest";

import {
  resumeUpload,
  uploadFile,
  type FileUploadApi,
  type UploadFileLike,
} from "./file-upload";

function fileOf(content: string): UploadFileLike {
  return {
    name: "a.txt",
    size: content.length,
    type: "text/plain",
    slice: (start, end) => new Blob([content.slice(start, end)]),
  };
}

function message(): ChatMessage {
  return {
    id: "msg-1",
    chatKey: "a:b",
    fromDevice: "a",
    toDevice: "b",
    kind: "file",
    text: null,
    fileId: "file-1",
    fileName: "a.txt",
    fileSize: 10,
    mime: "text/plain",
    transport: "cloud",
    status: "sent",
    createdAt: 1,
    expiresAt: 2,
  };
}

function api(overrides: Partial<FileUploadApi> = {}): FileUploadApi {
  return {
    initFile: vi.fn(async () => ({ fileId: "file-1", partSize: 4 })),
    putFilePart: vi.fn(async (_fileId, _part, chunk) => ({
      status: "incomplete" as const,
      uploadedBytes: (chunk as Blob).size,
    })),
    getFileState: vi.fn(async () => ({
      fileId: "file-1",
      uploadedBytes: 4,
      partSize: 4,
      state: "uploading" as const,
    })),
    completeFile: vi.fn(async () => message()),
    cancelFile: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("uploadFile", () => {
  it("uploads sequential parts, reports progress, and completes", async () => {
    const client = api();
    const put = vi
      .fn()
      .mockResolvedValueOnce({ status: "incomplete", uploadedBytes: 4 })
      .mockResolvedValueOnce({ status: "incomplete", uploadedBytes: 8 })
      .mockResolvedValueOnce({ status: "done", uploadedBytes: 10 });
    client.putFilePart = put;
    const progress = vi.fn();

    await expect(
      uploadFile(client, {
        file: fileOf("0123456789"),
        peerId: "peer-1",
        signal: new AbortController().signal,
        onProgress: progress,
        sleep: vi.fn(async () => undefined),
      }),
    ).resolves.toEqual(message());

    expect(put).toHaveBeenCalledTimes(3);
    expect(put).toHaveBeenNthCalledWith(
      3,
      "file-1",
      3,
      expect.any(Blob),
      "bytes 8-9/10",
    );
    expect(progress.mock.calls).toEqual([[40], [80], [100]]);
  });

  it("retries a part three times with exponential backoff", async () => {
    const client = api();
    client.putFilePart = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ status: "done", uploadedBytes: 10 });
    const sleep = vi.fn(async () => undefined);

    await uploadFile(client, {
      file: fileOf("0123456789"),
      peerId: "peer-1",
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      sleep,
    });

    expect(sleep.mock.calls).toEqual([[500], [1000]]);
  });

  it("fails after three attempts", async () => {
    const client = api();
    client.putFilePart = vi.fn(async () => {
      throw new Error("fail");
    });

    await expect(
      uploadFile(client, {
        file: fileOf("0123456789"),
        peerId: "peer-1",
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("fail");
  });

  it("resumes from server state", async () => {
    const client = api();
    const put = vi.fn<FileUploadApi["putFilePart"]>(async () => ({
      status: "done" as const,
      uploadedBytes: 10,
    }));
    client.putFilePart = put;

    await resumeUpload(client, {
      file: fileOf("0123456789"),
      fileId: "file-1",
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      sleep: vi.fn(async () => undefined),
    });

    expect(put).toHaveBeenCalledWith(
      "file-1",
      2,
      expect.any(Blob),
      "bytes 4-7/10",
    );
    expect(client.completeFile).toHaveBeenCalledWith("file-1");
  });


  it("cancels when aborted between parts", async () => {
    const client = api();
    const controller = new AbortController();
    client.putFilePart = vi.fn<FileUploadApi["putFilePart"]>(async () => ({
      status: "incomplete",
      uploadedBytes: 4,
    }));

    await expect(
      uploadFile(client, {
        file: fileOf("0123456789"),
        peerId: "peer-1",
        signal: controller.signal,
        onProgress: () => controller.abort(),
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("Aborted");
    expect(client.cancelFile).toHaveBeenCalledWith("file-1");
  });

  it("cancels a server upload when aborted during a part", async () => {
    const client = api();
    const controller = new AbortController();
    client.putFilePart = vi.fn<FileUploadApi["putFilePart"]>(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      uploadFile(client, {
        file: fileOf("0123456789"),
        peerId: "peer-1",
        signal: controller.signal,
        onProgress: vi.fn(),
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("Aborted");
    expect(client.cancelFile).toHaveBeenCalledWith("file-1");
  });

  it("uses a safe fallback mime type and rejects non-uploading resumes", async () => {
    const client = api();
    client.getFileState = vi.fn(async () => ({
      fileId: "file-1",
      uploadedBytes: 0,
      partSize: 4,
      state: "ready",
    }));

    await expect(
      resumeUpload(client, {
        file: { ...fileOf("0123456789"), type: "" },
        fileId: "file-1",
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("upload_not_resumable");

    const fresh = api();
    fresh.putFilePart = vi.fn<FileUploadApi["putFilePart"]>(
      async () => ({
        status: "done",
        uploadedBytes: 10,
      }),
    );
    await uploadFile(fresh, {
      file: { ...fileOf("0123456789"), type: "" },
      peerId: "peer-1",
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      sleep: vi.fn(async () => undefined),
    });
    expect(fresh.initFile).toHaveBeenCalledWith(
      expect.objectContaining({ mime: "application/octet-stream" }),
    );
  });
});
