import { fetchWithRetry } from "./google";
import type { Env } from "./env";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REFRESH_WINDOW_MS = 300_000;

export function isTokenFresh(expiresAt: number, now: number): boolean {
  return now < expiresAt - REFRESH_WINDOW_MS;
}

export class TokenKeeper {
  private refreshPromise: Promise<TokenCache> | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/token" && request.method === "GET") {
      try {
        const token = await this.getToken();
        return Response.json({
          accessToken: token.accessToken,
          expiresAt: token.expiresAt,
        });
      } catch {
        return Response.json(
          { error: "token_refresh_failed" },
          { status: 502 },
        );
      }
    }

    if (url.pathname === "/invalidate" && request.method === "POST") {
      await this.ctx.storage.delete("token");
      return Response.json({ ok: true });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }

  private async getToken(): Promise<TokenCache> {
    const now = Date.now();
    const cached = await this.ctx.storage.get<TokenCache>("token");
    if (cached && isTokenFresh(cached.expiresAt, now)) {
      return cached;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refresh(now).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refresh(now: number): Promise<TokenCache> {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(this.env.TOKEN_REFRESH_DELAY_MS)),
    );

    const response = await fetchWithRetry(
      () =>
        fetch(TOKEN_URL, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: this.env.GOOGLE_CLIENT_ID,
            client_secret: this.env.GOOGLE_CLIENT_SECRET,
            refresh_token: this.env.GOOGLE_REFRESH_TOKEN,
            grant_type: "refresh_token",
          }).toString(),
        }),
      Number(this.env.RETRY_BASE_MS),
    );

    if (!response.ok) {
      throw new Error("token_refresh_failed");
    }

    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!body.access_token) {
      throw new Error("token_refresh_failed");
    }

    const token: TokenCache = {
      accessToken: body.access_token,
      expiresAt: now + Number(body.expires_in ?? 0) * 1000,
    };
    await this.ctx.storage.put("token", token);
    return token;
  }
}
