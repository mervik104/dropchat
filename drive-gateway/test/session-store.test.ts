import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

function sessions() {
  return env.SESSIONS.get(env.SESSIONS.idFromName("global"));
}

describe("SessionStore", () => {
  it("stores, reads, and deletes a session", async () => {
    const stub = sessions();
    const session = {
      sessionUri: "https://upload.example/session",
      totalSize: 10,
      mime: "text/plain",
      createdAt: 1,
    };

    const put = await stub.fetch("https://sessions/sessions/session-1", {
      method: "PUT",
      body: JSON.stringify(session),
    });
    expect(put.status).toBe(204);

    const get = await stub.fetch("https://sessions/sessions/session-1");
    expect(await get.json()).toEqual(session);

    const del = await stub.fetch("https://sessions/sessions/session-1", {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const missing = await stub.fetch("https://sessions/sessions/session-1");
    expect(missing.status).toBe(404);
  });

  it("returns 404 for unknown routes and methods", async () => {
    expect(
      (await sessions().fetch("https://sessions/unknown")).status,
    ).toBe(404);
    expect(
      (
        await sessions().fetch("https://sessions/sessions/session-1", {
          method: "PATCH",
        })
      ).status,
    ).toBe(404);
  });
});
