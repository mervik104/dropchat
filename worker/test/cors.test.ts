import { describe, expect, it } from "vitest";

import { isAllowedOrigin } from "../src/cors";
import { api, makeApp } from "./helpers";

describe("isAllowedOrigin", () => {
  it("allows the configured web origin exactly", () => {
    expect(
      isAllowedOrigin("https://dropchat.example", "https://dropchat.example"),
    ).toBe(true);
  });

  it("allows localhost with any port", () => {
    expect(isAllowedOrigin("http://localhost:5173", "https://dropchat.example")).toBe(
      true,
    );
    expect(isAllowedOrigin("http://127.0.0.1:8788", "https://dropchat.example")).toBe(
      true,
    );
  });

  it("rejects non-http localhost and lookalike hosts", () => {
    expect(isAllowedOrigin("https://localhost:5173", "https://dropchat.example")).toBe(
      false,
    );
    expect(
      isAllowedOrigin("http://localhost.evil.example", "https://dropchat.example"),
    ).toBe(false);
  });

  it("rejects other origins and invalid values", () => {
    expect(isAllowedOrigin("https://evil.example", "https://dropchat.example")).toBe(
      false,
    );
    expect(isAllowedOrigin("not a url", "https://dropchat.example")).toBe(false);
  });
});

describe("CORS middleware", () => {
  it("adds CORS headers for the configured origin", async () => {
    const response = await api(makeApp(), "/api/hello", {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("adds CORS headers for localhost on another port", async () => {
    const response = await api(makeApp(), "/api/hello", {
      headers: { Origin: "http://127.0.0.1:9999" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("does not add CORS headers for an unknown origin", async () => {
    const response = await api(makeApp(), "/api/hello", {
      headers: { Origin: "https://evil.example" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not add CORS headers without Origin", async () => {
    const response = await api(makeApp(), "/api/hello");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers preflight for an allowed origin", async () => {
    const response = await api(makeApp(), "/api/devices", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "Authorization",
    );
    expect(response.headers.get("access-control-max-age")).toBe("86400");
  });

  it("does not answer preflight for a disallowed origin with CORS headers", async () => {
    const response = await api(makeApp(), "/api/devices", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("handles preflight for authenticated routes without auth", async () => {
    const response = await api(makeApp(), "/api/peers", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
      },
    });

    expect(response.status).toBe(204);
  });
});
