import { describe, expect, it, vi } from "vitest";

import { DriveGatewayAdapter } from "../src/drive-adapter";
import { createDownloadToken, verifyDownloadToken } from "../src/file-links";
import { safeDownloadHeaders, sanitizeFilename } from "../src/filename";

describe("sanitizeFilename", () => {
  it("removes path separators and control characters", () => {
    expect(sanitizeFilename("../../evil\r\nX: y.html")).toBe("evilX y.html");
    expect(sanitizeFilename("   ")).toBe("file");
  });

  it("keeps unicode and limits length", () => {
    const sanitized = sanitizeFilename("фото.png");
    expect(sanitized).toBe("фото.png");
    expect(sanitizeFilename("x".repeat(200)).length).toBe(120);
  });
});

describe("safeDownloadHeaders", () => {
  it("uses attachment and octet-stream for unsafe types", () => {
    const headers = safeDownloadHeaders("page.html", "text/html");
    expect(headers.get("content-type")).toBe("application/octet-stream");
    expect(headers.get("content-disposition")).toContain("attachment");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows inline preview only for safe images", () => {
    const headers = safeDownloadHeaders("photo.png", "image/png");
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.get("content-disposition")).toContain("inline");
    expect(
      safeDownloadHeaders("vector.svg", "image/svg+xml").get("content-type"),
    ).toBe("application/octet-stream");
  });
});

describe("download tokens", () => {
  it("signs and verifies a token", async () => {
    const token = await createDownloadToken("file-1", "device-1", 1_000, "key");

    await expect(verifyDownloadToken(token, "file-1", 999, "key")).resolves.toBe(
      "device-1",
    );
  });

  it("rejects tampered, expired, and wrong-file tokens", async () => {
    const token = await createDownloadToken("file-1", "device-1", 1_000, "key");

    await expect(verifyDownloadToken(token, "file-1", 1_000, "key")).resolves.toBeNull();
    await expect(
      verifyDownloadToken(token.replace(/.$/, "x"), "file-1", 999, "key"),
    ).resolves.toBeNull();
    await expect(verifyDownloadToken(token, "file-2", 999, "key")).resolves.toBeNull();
    await expect(verifyDownloadToken("bad", "file-1", 999, "key")).resolves.toBeNull();
  });
});

describe("DriveGatewayAdapter", () => {
  function response(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }

  it("calls the service binding with the internal key", async () => {
    const fetcher = {
      fetch: vi
        .fn()
        .mockResolvedValueOnce(response({ sessionId: "session-1" }))
        .mockResolvedValueOnce(response({ status: "incomplete", nextOffset: 4 }))
        .mockResolvedValueOnce(
          response({ status: "done", driveFileId: "drive-1" }),
        )
        .mockResolvedValueOnce(
          new Response("data", { status: 206, headers: { "content-range": "bytes 0-1/2" } }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          response({ ok: true, quotaUsed: 10, quotaLimit: 20 }),
        ),
    };
    const adapter = new DriveGatewayAdapter(fetcher as unknown as Fetcher, "key");

    await expect(adapter.init(10, "text/plain")).resolves.toEqual({
      sessionId: "session-1",
    });
    await expect(
      adapter.putPart("session-1", new Uint8Array([1, 2]), "bytes 0-1/10"),
    ).resolves.toEqual({ status: "incomplete", nextOffset: 4 });
    await expect(
      adapter.putPart("session-1", new Uint8Array([3, 4]), "bytes 2-3/10"),
    ).resolves.toEqual({ status: "done", driveFileId: "drive-1" });
    await expect(adapter.getStream("drive-1", "bytes=0-1")).resolves.toBeInstanceOf(
      Response,
    );
    await expect(adapter.delete("drive-1")).resolves.toBeUndefined();
    await expect(adapter.cancel("session-1")).resolves.toBeUndefined();

    const calls = (fetcher.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ "X-Internal-Key": "key" }),
    });
    expect(calls[3]![1]).toMatchObject({
      headers: expect.objectContaining({
        "X-Internal-Key": "key",
        Range: "bytes=0-1",
      }),
    });
    await expect(adapter.health()).resolves.toEqual({
      ok: true,
      quotaUsed: 10,
      quotaLimit: 20,
    });
  });

  it("throws generic errors on gateway failures", async () => {
    const fetcher = {
      fetch: vi.fn(async () => response({ error: "nope" }, 500)),
    };
    const adapter = new DriveGatewayAdapter(fetcher as unknown as Fetcher, "key");

    await expect(adapter.init(10, "text/plain")).rejects.toThrow("storage_failed");
    await expect(adapter.putPart("s", new Uint8Array(), "bytes 0-0/1")).rejects.toThrow(
      "storage_failed",
    );
    await expect(adapter.getStream("f")).rejects.toThrow("storage_failed");
    await expect(adapter.delete("f")).rejects.toThrow("storage_failed");
    await expect(adapter.cancel("s")).rejects.toThrow("storage_failed");
    await expect(adapter.health()).rejects.toThrow("storage_failed");
  });
});
