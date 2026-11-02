import type { StorageAdapter } from "@dropchat/shared";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app";
import { createDownloadToken } from "../src/file-links";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  NOW,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  api,
  authHeaders,
  linkDevices,
  makeApp,
  register,
} from "./helpers";

function fakeStorage() {
  const storage: StorageAdapter = {
    init: vi.fn(async () => ({ sessionId: "session-1" })),
    putPart: vi.fn(async () => ({ status: "incomplete" as const, nextOffset: 0 })),
    getStream: vi.fn(async () =>
      new Response("data", {
        status: 206,
        headers: {
          "content-range": "bytes 0-3/10",
          "content-length": "4",
          "accept-ranges": "bytes",
        },
      }),
    ),
    delete: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
  return storage;
}

function fileApp(storage: StorageAdapter, options: Record<string, unknown> = {}) {
  return createApp({
    now: () => NOW,
    storage,
    ...options,
  });
}

async function linkedDevices(app: ReturnType<typeof createApp>) {
  await register(app, { deviceId: DEVICE_A, name: "Alpha" });
  await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
  await register(app, { deviceId: DEVICE_C, secret: SECRET_C, name: "Gamma" });
  await linkDevices(DEVICE_A, DEVICE_B);
}

function authPost(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  deviceId = DEVICE_A,
  secret = SECRET_A,
): Promise<Response> {
  return api(app, path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(deviceId, secret),
    },
    body: JSON.stringify(body),
  });
}

async function initFile(
  app: ReturnType<typeof createApp>,
  overrides: Record<string, unknown> = {},
): Promise<Response> {
  return authPost(app, "/api/files/init", {
    name: "report.txt",
    size: 10,
    mime: "text/plain",
    peerId: DEVICE_B,
    ...overrides,
  });
}

async function uploadDone(
  app: ReturnType<typeof createApp>,
  storage: StorageAdapter,
  fileId: string,
  size = 10,
): Promise<void> {
  storage.putPart = vi.fn(async () => ({
    status: "done" as const,
    driveFileId: "drive-file-1",
  }));
  const response = await api(app, `/api/files/${fileId}/parts/1`, {
    method: "PUT",
    headers: {
      "content-range": `bytes 0-${size - 1}/${size}`,
      ...authHeaders(DEVICE_A, SECRET_A),
    },
    body: "x".repeat(size),
  });
  expect(response.status).toBe(200);
}

async function readyFile(
  app: ReturnType<typeof createApp>,
  storage: StorageAdapter,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const created = await initFile(app, overrides);
  const body = (await created.json()) as { fileId: string };
  await uploadDone(app, storage, body.fileId, Number(overrides.size ?? 10));
  const completed = await authPost(app, `/api/files/${body.fileId}/complete`, {});
  expect(completed.status).toBe(201);
  return body.fileId;
}

describe("POST /api/files/init", () => {
  it("creates an uploading file for a linked peer", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    const response = await initFile(app);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { fileId: string; partSize: number };
    expect(body.partSize).toBe(32 * 1024 * 1024);
    expect(body.fileId).toMatch(/^[0-9a-f-]{36}$/);
    expect(storage.init).toHaveBeenCalledWith(10, "text/plain");

    const row = await env.DB.prepare("SELECT * FROM files WHERE id = ?")
      .bind(body.fileId)
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      owner_device: DEVICE_A,
      peer_device: DEVICE_B,
      name: "report.txt",
      size: 10,
      mime: "text/plain",
      session_id: "session-1",
      uploaded_bytes: 0,
      state: "uploading",
    });
    expect(JSON.stringify(body)).not.toContain("session-1");
  });

  it("uses a client-provided file id for idempotent cleanup", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = "11111111-1111-4111-8111-111111111111";

    const response = await initFile(app, { fileId });
    expect(response.status).toBe(201);
    expect((await response.json()) as { fileId: string }).toMatchObject({
      fileId,
    });
    const row = await env.DB.prepare("SELECT id FROM files WHERE id = ?")
      .bind(fileId)
      .first<{ id: string }>();
    expect(row?.id).toBe(fileId);
  });

  it("rejects non-linked peers, disabled uploads, and invalid input", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect((await initFile(app, { peerId: DEVICE_C })).status).toBe(403);

    const disabled = fileApp(storage, { cloudUploadsEnabled: false });
    expect((await initFile(disabled)).status).toBe(503);

    for (const body of [
      { name: "", size: 10, mime: "text/plain", peerId: DEVICE_B },
      { name: "a", size: 0, mime: "text/plain", peerId: DEVICE_B },
      { name: "a", size: 10, mime: "", peerId: DEVICE_B },
      { name: "a", size: 10, mime: "text/plain" },
      { name: "a", size: 10, mime: "text/plain", peerId: DEVICE_B, fileId: "bad" },
      {
        name: "a",
        size: 10,
        mime: "text/plain",
        peerId: DEVICE_B,
        fileId: 123,
      },
    ]) {
      expect((await authPost(app, "/api/files/init", body)).status).toBe(400);
    }
  });

  it("enforces the max file size", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, { maxFileSize: 5 });
    await linkedDevices(app);

    expect((await initFile(app, { size: 6 })).status).toBe(413);
  });

  it("enforces the per-device 24h upload quota", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, {
      maxFileSize: 100,
      perDeviceUploadPer24h: 10,
      perDeviceStoredTotal: 100,
      globalStoredTotal: 100,
    });
    await linkedDevices(app);

    expect((await initFile(app, { size: 6 })).status).toBe(201);
    expect((await initFile(app, { size: 5 })).status).toBe(429);
  });

  it("enforces the per-device stored quota", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, {
      maxFileSize: 100,
      perDeviceUploadPer24h: 100,
      perDeviceStoredTotal: 10,
      globalStoredTotal: 100,
    });
    await linkedDevices(app);

    expect((await initFile(app, { size: 6 })).status).toBe(201);
    expect((await initFile(app, { size: 5 })).status).toBe(429);
  });

  it("enforces the global stored quota", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, {
      maxFileSize: 100,
      perDeviceUploadPer24h: 100,
      perDeviceStoredTotal: 100,
      globalStoredTotal: 10,
    });
    await linkedDevices(app);

    expect((await initFile(app, { size: 6 })).status).toBe(201);
    expect(
      (
        await authPost(
          app,
          "/api/files/init",
          {
            name: "second.txt",
            size: 5,
            mime: "text/plain",
            peerId: DEVICE_A,
          },
          DEVICE_B,
          SECRET_B,
        )
      ).status,
    ).toBe(429);
  });


  it("keeps concurrent quota checks atomic and cleans rejected sessions", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, {
      maxFileSize: 100,
      perDeviceUploadPer24h: 10,
      perDeviceStoredTotal: 100,
      globalStoredTotal: 100,
    });
    await linkedDevices(app);
    storage.cancel = vi.fn(async () => {
      throw new Error("cancel failed");
    });

    const responses = await Promise.all([
      initFile(app, { size: 6, name: "one.txt" }),
      initFile(app, { size: 6, name: "two.txt" }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 429,
    ]);
    expect(storage.cancel).toHaveBeenCalledTimes(1);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM files WHERE state = 'uploading'",
    ).first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("uses the default Drive gateway adapter", async () => {
    const drivetFetch = vi
      .spyOn(env.DRIVE, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ sessionId: "default-session" }), {
          headers: { "content-type": "application/json" },
        }),
      );
    const app = createApp({ now: () => NOW });
    await linkedDevices(app);

    const response = await initFile(app);

    expect(response.status).toBe(201);
    expect(drivetFetch).toHaveBeenCalledWith(
      "https://drive-gateway/init",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Internal-Key": "test-internal-key" }),
      }),
    );
    drivetFetch.mockRestore();
  });

  it("rejects malformed init JSON, non-string names, and storage failures", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect(
      (
        await api(app, "/api/files/init", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect(
      (await authPost(app, "/api/files/init", {
        name: 123,
        size: 10,
        mime: "text/plain",
        peerId: DEVICE_B,
      })).status,
    ).toBe(400);
    expect(
      (await authPost(app, "/api/files/init", null)).status,
    ).toBe(400);

    storage.init = vi.fn(async () => {
      throw new Error("storage down");
    });
    expect((await initFile(app)).status).toBe(502);
  });

  it("rate limits init requests", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, { fileInitLimitPerHour: 1 });
    await linkedDevices(app);

    expect((await initFile(app)).status).toBe(201);
    expect((await initFile(app)).status).toBe(429);
  });
});

describe("file parts, state, and completion", () => {
  it("uploads sequential parts and exposes resume state", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const created = await initFile(app);
    const { fileId } = (await created.json()) as { fileId: string };

    storage.putPart = vi
      .fn()
      .mockResolvedValueOnce({ status: "incomplete", nextOffset: 4 })
      .mockResolvedValueOnce({ status: "done", driveFileId: "drive-file-1" });

    const first = await api(app, `/api/files/${fileId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 0-3/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "abcd",
    });
    expect(await first.json()).toEqual({
      status: "incomplete",
      uploadedBytes: 4,
    });

    const state = await api(app, `/api/files/${fileId}/state`, {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(await state.json()).toEqual({
      fileId,
      uploadedBytes: 4,
      partSize: 32 * 1024 * 1024,
      state: "uploading",
    });

    const second = await api(app, `/api/files/${fileId}/parts/2`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 4-9/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "efghij",
    });
    expect(await second.json()).toEqual({
      status: "done",
      uploadedBytes: 10,
    });
  });

  it("rejects out-of-order parts, wrong ranges, recipient writes, and storage errors", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };

    const outOfOrder = await api(app, `/api/files/${fileId}/parts/2`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 4-9/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "efghij",
    });
    expect(outOfOrder.status).toBe(409);

    const wrongRange = await api(app, `/api/files/${fileId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 1-4/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "abcd",
    });
    expect(wrongRange.status).toBe(409);

    const recipient = await api(app, `/api/files/${fileId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 0-3/10",
        ...authHeaders(DEVICE_B, SECRET_B),
      },
      body: "abcd",
    });
    expect(recipient.status).toBe(403);

    storage.putPart = vi.fn(async () => {
      throw new Error("gateway down");
    });
    const failed = await api(app, `/api/files/${fileId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 0-3/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "abcd",
    });
    expect(failed.status).toBe(502);
  });


  it("rejects missing files, ready files, expired files, and malformed ranges", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect(
      (
        await api(app, "/api/files/missing/parts/1", {
          method: "PUT",
          headers: {
            "content-range": "bytes 0-1/2",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "ab",
        })
      ).status,
    ).toBe(404);

    const { fileId } = (await (await initFile(app)).json()) as { fileId: string };
    await uploadDone(app, storage, fileId);
    await authPost(app, `/api/files/${fileId}/complete`, {});

    expect(
      (
        await api(app, `/api/files/${fileId}/parts/2`, {
          method: "PUT",
          headers: {
            "content-range": "bytes 10-11/12",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "ab",
        })
      ).status,
    ).toBe(409);

    const expired = await initFile(app, { name: "expired.txt" });
    const expiredId = ((await expired.json()) as { fileId: string }).fileId;
    await env.DB.prepare("UPDATE files SET expires_at = ? WHERE id = ?")
      .bind(NOW - 1, expiredId)
      .run();
    expect(
      (
        await api(app, `/api/files/${expiredId}/parts/1`, {
          method: "PUT",
          headers: {
            "content-range": "bytes 0-1/10",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "ab",
        })
      ).status,
    ).toBe(410);

    const missingRange = await initFile(app, { name: "range.txt" });
    const missingRangeId = ((await missingRange.json()) as { fileId: string })
      .fileId;
    expect(
      (
        await api(app, `/api/files/${missingRangeId}/parts/1`, {
          method: "PUT",
          headers: authHeaders(DEVICE_A, SECRET_A),
          body: "ab",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api(app, `/api/files/${missingRangeId}/parts/1`, {
          method: "PUT",
          headers: {
            "content-range": "bytes 0-1/999",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "ab",
        })
      ).status,
    ).toBe(400);

    const wrongLength = await initFile(app, { name: "length.txt" });
    const wrongLengthId = ((await wrongLength.json()) as { fileId: string })
      .fileId;
    expect(
      (
        await api(app, `/api/files/${wrongLengthId}/parts/1`, {
          method: "PUT",
          headers: {
            "content-range": "bytes 0-4/10",
            ...authHeaders(DEVICE_A, SECRET_A),
          },
          body: "ab",
        })
      ).status,
    ).toBe(400);
  });

  it("returns state errors for missing and foreign files", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect(
      (
        await api(app, "/api/files/missing/state", {
          headers: authHeaders(DEVICE_A, SECRET_A),
        })
      ).status,
    ).toBe(404);

    const { fileId } = (await (await initFile(app)).json()) as { fileId: string };
    expect(
      (
        await api(app, `/api/files/${fileId}/state`, {
          headers: authHeaders(DEVICE_B, SECRET_B),
        })
      ).status,
    ).toBe(403);
  });

  it("completes an upload, creates a file message, and is idempotent", async () => {
    const storage = fakeStorage();
    const notify = vi.fn(async () => undefined);
    const app = fileApp(storage, { notifyEvent: notify });
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };
    await uploadDone(app, storage, fileId);

    const complete = await authPost(
      app,
      `/api/files/${fileId}/complete`,
      {},
    );

    expect(complete.status).toBe(201);
    const body = (await complete.json()) as {
      file: Record<string, unknown>;
      message: Record<string, unknown>;
    };
    expect(body.file).toMatchObject({ id: fileId, state: "ready" });
    expect(body.message).toMatchObject({
      kind: "file",
      fileId,
      fileName: "report.txt",
      fileSize: 10,
      mime: "text/plain",
      transport: "cloud",
    });
    expect(JSON.stringify(body)).not.toContain("drive-file-1");

    const again = await authPost(app, `/api/files/${fileId}/complete`, {});
    expect(again.status).toBe(200);
    const againBody = (await again.json()) as { message: Record<string, unknown> };
    expect(againBody.message.id).toBe(body.message.id);

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE file_id = ?",
    )
      .bind(fileId)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);

    const day = new Date(NOW).toISOString().slice(0, 10);
    const usage = await env.DB.prepare(
      "SELECT bytes_uploaded FROM usage WHERE device_id = ? AND day = ?",
    )
      .bind(DEVICE_A, day)
      .first<{ bytes_uploaded: number }>();
    expect(usage?.bytes_uploaded).toBe(10);

    await authPost(app, `/api/files/${fileId}/complete`, {});
    const usageAgain = await env.DB.prepare(
      "SELECT bytes_uploaded FROM usage WHERE device_id = ? AND day = ?",
    )
      .bind(DEVICE_A, day)
      .first<{ bytes_uploaded: number }>();
    expect(usageAgain?.bytes_uploaded).toBe(10);
  });

  it("rejects completion before all bytes and by a non-owner", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };

    expect((await authPost(app, `/api/files/${fileId}/complete`, {})).status).toBe(
      409,
    );
    expect(
      (
        await authPost(
          app,
          `/api/files/${fileId}/complete`,
          {},
          DEVICE_B,
          SECRET_B,
        )
      ).status,
    ).toBe(403);
  });

  it("rejects parts and completion after the devices are unlinked", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const partFile = (await (await initFile(app)).json()) as {
      fileId: string;
    };
    const completeFile = (await (await initFile(app, { name: "done.txt" })).json()) as {
      fileId: string;
    };
    await uploadDone(app, storage, completeFile.fileId);

    const unlink = await api(app, `/api/peers/${DEVICE_B}`, {
      method: "DELETE",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(unlink.status).toBe(204);

    const part = await api(
      app,
      `/api/files/${partFile.fileId}/parts/1`,
      {
        method: "PUT",
        headers: {
          "content-range": "bytes 0-3/10",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: "abcd",
      },
    );
    expect(part.status).toBe(403);

    expect(
      (
        await authPost(
          app,
          `/api/files/${completeFile.fileId}/complete`,
          {},
        )
      ).status,
    ).toBe(403);
  });

  it("does not revive files canceled while a part is in flight", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const first = (await (await initFile(app)).json()) as { fileId: string };
    storage.putPart = vi.fn(async () => {
      await env.DB.prepare("UPDATE files SET state = 'deleted' WHERE id = ?")
        .bind(first.fileId)
        .run();
      return { status: "incomplete" as const, nextOffset: 4 };
    });
    const incomplete = await api(
      app,
      `/api/files/${first.fileId}/parts/1`,
      {
        method: "PUT",
        headers: {
          "content-range": "bytes 0-3/10",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: "abcd",
      },
    );
    expect(incomplete.status).toBe(409);

    const second = (await (await initFile(app, { name: "race.txt" })).json()) as {
      fileId: string;
    };
    storage.delete = vi.fn(async () => {
      throw new Error("delete failed");
    });
    storage.cancel = vi.fn(async () => {
      throw new Error("cancel failed");
    });
    storage.putPart = vi.fn(async () => {
      await env.DB.prepare("UPDATE files SET state = 'deleted' WHERE id = ?")
        .bind(second.fileId)
        .run();
      return { status: "done" as const, driveFileId: "orphan-drive" };
    });
    const done = await api(
      app,
      `/api/files/${second.fileId}/parts/1`,
      {
        method: "PUT",
        headers: {
          "content-range": "bytes 0-3/10",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body: "abcd",
      },
    );
    expect(done.status).toBe(409);
    expect(storage.delete).toHaveBeenCalledWith("orphan-drive");
    expect(storage.cancel).toHaveBeenCalledWith("session-1");
  });

  it("rate limits part uploads", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, { filePartLimitPerMinute: 1 });
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };

    const first = await api(app, `/api/files/${fileId}/parts/1`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 0-3/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "abcd",
    });
    expect(first.status).toBe(200);

    const second = await api(app, `/api/files/${fileId}/parts/2`, {
      method: "PUT",
      headers: {
        "content-range": "bytes 4-9/10",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "efghij",
    });
    expect(second.status).toBe(429);
  });
});

describe("download links and downloads", () => {
  it("issues a short-lived link and serves safe ranged downloads", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);

    const link = await authPost(app, `/api/files/${fileId}/link`, {});
    expect(link.status).toBe(200);
    const { url } = (await link.json()) as { url: string };
    expect(url).toContain("/api/files/");
    const path = new URL(url).pathname + new URL(url).search;

    const download = await api(app, path, { headers: { Range: "bytes=0-3" } });
    expect(download.status).toBe(206);
    expect(new TextDecoder().decode(await download.arrayBuffer())).toBe("data");
    expect(download.headers.get("content-type")).toBe("application/octet-stream");
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("content-range")).toBe("bytes 0-3/10");
    expect(storage.getStream).toHaveBeenCalledWith("drive-file-1", "bytes=0-3");
  });


  it("does not create duplicate messages for concurrent completes", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const created = await initFile(app);
    const body = (await created.json()) as { fileId: string };
    await uploadDone(app, storage, body.fileId);

    const [first, second] = await Promise.all([
      authPost(app, `/api/files/${body.fileId}/complete`, {}),
      authPost(app, `/api/files/${body.fileId}/complete`, {}),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const messages = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE file_id = ?",
    )
      .bind(body.fileId)
      .first<{ count: number }>();
    expect(messages).toEqual({ count: 1 });

    const usage = await env.DB.prepare(
      "SELECT COALESCE(SUM(bytes_uploaded), 0) AS total FROM usage",
    ).first<{ total: number }>();
    expect(usage).toEqual({ total: 10 });
  });

  it("handles missing complete requests, rate limits, and ready files without messages", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, { fileCompleteLimitPerHour: 1 });
    await linkedDevices(app);

    expect((await authPost(app, "/api/files/missing/complete", {})).status).toBe(
      404,
    );

    const { fileId } = (await (await initFile(app)).json()) as { fileId: string };
    await uploadDone(app, storage, fileId);
    expect((await authPost(app, `/api/files/${fileId}/complete`, {})).status).toBe(
      201,
    );
    expect((await authPost(app, `/api/files/${fileId}/complete`, {})).status).toBe(
      429,
    );

    const noLimitApp = fileApp(storage);
    const second = await initFile(noLimitApp, { name: "ready.txt" });
    const secondId = ((await second.json()) as { fileId: string }).fileId;
    await uploadDone(noLimitApp, storage, secondId);
    await env.DB.prepare("UPDATE files SET state = 'ready' WHERE id = ?")
      .bind(secondId)
      .run();
    expect(
      (await authPost(noLimitApp, `/api/files/${secondId}/complete`, {})).status,
    ).toBe(409);
  });

  it("revokes recipient links after the devices are unlinked", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);

    const recipientLink = await authPost(
      app,
      `/api/files/${fileId}/link`,
      {},
      DEVICE_B,
      SECRET_B,
    );
    expect(recipientLink.status).toBe(200);
    const { url } = (await recipientLink.json()) as { url: string };
    const path = new URL(url).pathname + new URL(url).search;

    const unlink = await api(app, `/api/peers/${DEVICE_B}`, {
      method: "DELETE",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(unlink.status).toBe(204);

    expect((await api(app, path)).status).toBe(403);
    expect(
      (
        await authPost(
          app,
          `/api/files/${fileId}/link`,
          {},
          DEVICE_B,
          SECRET_B,
        )
      ).status,
    ).toBe(403);
    expect(
      (await authPost(app, `/api/files/${fileId}/link`, {})).status,
    ).toBe(200);
  });

  it("rejects links for uploading files", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as { fileId: string };

    expect((await authPost(app, `/api/files/${fileId}/link`, {})).status).toBe(409);
  });

  it("allows the recipient to request a link but not a non-peer", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);

    expect(
      (
        await authPost(
          app,
          `/api/files/${fileId}/link`,
          {},
          DEVICE_B,
          SECRET_B,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await authPost(
          app,
          `/api/files/${fileId}/link`,
          {},
          DEVICE_C,
          SECRET_C,
        )
      ).status,
    ).toBe(403);
  });

  it("rejects expired, tampered, and wrong-file links", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);
    const { url } = (await (await authPost(app, `/api/files/${fileId}/link`, {})).json()) as {
      url: string;
    };
    const parsed = new URL(url);
    const expiredApp = createApp({ now: () => NOW + 61_000, storage });
    const expired = await api(
      expiredApp,
      parsed.pathname + parsed.search,
    );
    expect(expired.status).toBe(403);

    const tampered = await api(
      app,
      parsed.pathname + parsed.search.replace(/.$/, "x"),
    );
    expect(tampered.status).toBe(403);
  });

  it("uses safe inline headers only for whitelisted images", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage, {
      name: "photo.png",
      mime: "image/png",
    });
    storage.getStream = vi.fn(async () =>
      new Response("img", { status: 200 }),
    );
    const { url } = (await (await authPost(app, `/api/files/${fileId}/link`, {})).json()) as {
      url: string;
    };
    const download = await api(app, new URL(url).pathname + new URL(url).search);

    expect(download.headers.get("content-type")).toBe("image/png");
    expect(download.headers.get("content-disposition")).toContain("inline");
    expect(download.headers.get("accept-ranges")).toBe("bytes");
  });

  it("returns 410 for expired files and 502 for storage errors", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);
    await env.DB.prepare("UPDATE files SET expires_at = ? WHERE id = ?")
      .bind(NOW - 1, fileId)
      .run();

    expect((await authPost(app, `/api/files/${fileId}/link`, {})).status).toBe(410);

    await env.DB.prepare("UPDATE files SET expires_at = ? WHERE id = ?")
      .bind(NOW + 1000, fileId)
      .run();
    const { url } = (await (await authPost(app, `/api/files/${fileId}/link`, {})).json()) as {
      url: string;
    };
    storage.getStream = vi.fn(async () => {
      throw new Error("storage down");
    });
    expect(
      (await api(app, new URL(url).pathname + new URL(url).search)).status,
    ).toBe(502);
  });


  it("rejects missing, foreign, uploading, expired, and failed downloads", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect((await api(app, "/api/files/missing/download")).status).toBe(403);

    const fileId = await readyFile(app, storage);
    const exp = Math.floor(NOW / 1000) + 60;
    const missingToken = await createDownloadToken(
      "missing",
      DEVICE_A,
      exp,
      "test-download-signing-key",
    );
    expect(
      (
        await api(
          app,
          `/api/files/missing/download?t=${encodeURIComponent(missingToken)}`,
        )
      ).status,
    ).toBe(403);

    const foreignToken = await createDownloadToken(
      fileId,
      DEVICE_C,
      exp,
      "test-download-signing-key",
    );
    expect(
      (
        await api(
          app,
          `/api/files/${fileId}/download?t=${encodeURIComponent(foreignToken)}`,
        )
      ).status,
    ).toBe(403);

    const uploading = await initFile(app, { name: "uploading.bin" });
    const uploadingId = ((await uploading.json()) as { fileId: string }).fileId;
    const uploadingToken = await createDownloadToken(
      uploadingId,
      DEVICE_A,
      exp,
      "test-download-signing-key",
    );
    expect(
      (
        await api(
          app,
          `/api/files/${uploadingId}/download?t=${encodeURIComponent(uploadingToken)}`,
        )
      ).status,
    ).toBe(409);

    await env.DB.prepare("UPDATE files SET expires_at = ? WHERE id = ?")
      .bind(NOW - 1, fileId)
      .run();
    const expiredToken = await createDownloadToken(
      fileId,
      DEVICE_A,
      exp,
      "test-download-signing-key",
    );
    expect(
      (
        await api(
          app,
          `/api/files/${fileId}/download?t=${encodeURIComponent(expiredToken)}`,
        )
      ).status,
    ).toBe(410);

    await env.DB.prepare("UPDATE files SET expires_at = ? WHERE id = ?")
      .bind(NOW + 1000, fileId)
      .run();
    storage.getStream = vi.fn(async () => new Response("nope", { status: 500 }));
    const token = await createDownloadToken(
      fileId,
      DEVICE_A,
      exp,
      "test-download-signing-key",
    );
    expect(
      (
        await api(
          app,
          `/api/files/${fileId}/download?t=${encodeURIComponent(token)}`,
        )
      ).status,
    ).toBe(502);
  });

  it("rate limits link creation", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage, { fileLinkLimitPerMinute: 1 });
    await linkedDevices(app);
    const fileId = await readyFile(app, storage);

    expect((await authPost(app, `/api/files/${fileId}/link`, {})).status).toBe(200);
    expect((await authPost(app, `/api/files/${fileId}/link`, {})).status).toBe(429);
  });
});

describe("DELETE /api/files/:id", () => {

  it("handles missing cancel targets, invalid states, ready uploads, and storage failures", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);

    expect(
      (
        await api(app, "/api/files/missing", {
          method: "DELETE",
          headers: authHeaders(DEVICE_A, SECRET_A),
        })
      ).status,
    ).toBe(404);

    const { fileId } = (await (await initFile(app)).json()) as { fileId: string };
    await uploadDone(app, storage, fileId);
    const completed = await authPost(app, `/api/files/${fileId}/complete`, {});
    expect(completed.status).toBe(201);
    expect(
      (
        await api(app, `/api/files/${fileId}`, {
          method: "DELETE",
          headers: authHeaders(DEVICE_A, SECRET_A),
        })
      ).status,
    ).toBe(409);

    const uploadedNotCompleted = await initFile(app, { name: "delete.bin" });
    const deleteId = ((await uploadedNotCompleted.json()) as { fileId: string })
      .fileId;
    await uploadDone(app, storage, deleteId);
    expect(
      (
        await api(app, `/api/files/${deleteId}`, {
          method: "DELETE",
          headers: authHeaders(DEVICE_A, SECRET_A),
        })
      ).status,
    ).toBe(204);
    expect(storage.delete).toHaveBeenCalled();

    const failing = await initFile(app, { name: "fail.bin" });
    const failingId = ((await failing.json()) as { fileId: string }).fileId;
    storage.cancel = vi.fn(async () => {
      throw new Error("storage down");
    });
    expect(
      (
        await api(app, `/api/files/${failingId}`, {
          method: "DELETE",
          headers: authHeaders(DEVICE_A, SECRET_A),
        })
      ).status,
    ).toBe(502);
    const rolledBack = await env.DB.prepare(
      "SELECT state FROM files WHERE id = ?",
    )
      .bind(failingId)
      .first<{ state: string }>();
    expect(rolledBack?.state).toBe("uploading");
  });

  it("claims cancellation atomically so only one concurrent delete wins", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };

    const responses = await Promise.all([
      api(app, `/api/files/${fileId}`, {
        method: "DELETE",
        headers: authHeaders(DEVICE_A, SECRET_A),
      }),
      api(app, `/api/files/${fileId}`, {
        method: "DELETE",
        headers: authHeaders(DEVICE_A, SECRET_A),
      }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      204, 409,
    ]);
    expect(storage.cancel).toHaveBeenCalledTimes(1);
  });

  it("cancels an uploading file and removes its quota reservation", async () => {
    const storage = fakeStorage();
    const app = fileApp(storage);
    await linkedDevices(app);
    const { fileId } = (await (await initFile(app)).json()) as {
      fileId: string;
    };

    let stateDuringCancel = "";
    storage.cancel = vi.fn(async () => {
      const row = await env.DB.prepare(
        "SELECT state FROM files WHERE id = ?",
      )
        .bind(fileId)
        .first<{ state: string }>();
      stateDuringCancel = row?.state ?? "";
    });
    const response = await api(app, `/api/files/${fileId}`, {
      method: "DELETE",
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(response.status).toBe(204);
    expect(stateDuringCancel).toBe("deleted");
    expect(storage.cancel).toHaveBeenCalledWith("session-1");
    const file = await env.DB.prepare("SELECT state FROM files WHERE id = ?")
      .bind(fileId)
      .first<{ state: string }>();
    expect(file?.state).toBe("deleted");
    const event = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM upload_events WHERE file_id = ?",
    )
      .bind(fileId)
      .first<{ count: number }>();
    expect(event?.count).toBe(0);

    expect(
      (
        await api(app, `/api/files/${fileId}`, {
          method: "DELETE",
          headers: authHeaders(DEVICE_B, SECRET_B),
        })
      ).status,
    ).toBe(403);
  });
});

describe("non-file app smoke", () => {
  it("still serves hello", async () => {
    const response = await api(makeApp(), "/api/hello");
    expect(response.status).toBe(200);
  });
});


describe("GET /api/health/drive", () => {
  it("returns Drive quota for an authenticated device", async () => {
    const app = createApp({
      now: () => NOW,
      driveHealth: async () => ({
        ok: true,
        quotaUsed: 123,
        quotaLimit: 1000,
      }),
    });
    await register(app);

    const response = await api(app, "/api/health/drive", {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      quotaUsed: 123,
      quotaLimit: 1000,
    });
  });


  it("uses the default gateway health adapter", async () => {
    const driveFetch = vi.spyOn(env.DRIVE, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, quotaUsed: 1, quotaLimit: 2 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const app = createApp({ now: () => NOW });
    await register(app);

    const response = await api(app, "/api/health/drive", {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(await response.json()).toEqual({
      ok: true,
      quotaUsed: 1,
      quotaLimit: 2,
    });
    expect(driveFetch).toHaveBeenCalledWith(
      "https://drive-gateway/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Internal-Key": "test-internal-key",
        }),
      }),
    );
    driveFetch.mockRestore();
  });

  it("requires auth and reports Drive failures generically", async () => {
    const app = createApp({
      now: () => NOW,
      driveHealth: async () => {
        throw new Error("drive down");
      },
    });
    await register(app);

    expect((await api(app, "/api/health/drive")).status).toBe(401);
    const failed = await api(app, "/api/health/drive", {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "drive_unavailable" });
  });
});
