import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("D1 migrations", () => {
  it.each([
    "devices",
    "peers",
    "invites",
    "files",
    "messages",
    "usage",
    "registration_rate_limits",
    "ws_tickets",
    "endpoint_rate_limits",
    "peer_requests",
    "invite_failures",
  ])(
    "creates the %s table",
    async (table) => {
      const row = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
        .bind(table)
        .first<{ name: string }>();

      expect(row?.name).toBe(table);
    },
  );

  it("enforces the files state constraint", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO files
          (id, owner_device, peer_device, name, size, mime, state, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          "file-1",
          "device-a",
          "device-b",
          "file.txt",
          1,
          "text/plain",
          "invalid",
          0,
          0,
        )
        .run(),
    ).rejects.toThrow();
  });

  it("enforces sorted peer pairs", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO peers (device_a, device_b, created_at) VALUES (?, ?, ?)",
      )
        .bind("device-z", "device-a", 0)
        .run(),
    ).rejects.toThrow();
  });
});
