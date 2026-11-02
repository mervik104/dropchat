export interface UploadSession {
  sessionUri: string;
  totalSize: number;
  mime: string;
  createdAt: number;
}

export class SessionStore {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/sessions\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }

    const key = `session:${decodeURIComponent(match[1]!)}`;
    if (request.method === "GET") {
      const session = await this.ctx.storage.get<UploadSession>(key);
      return session
        ? Response.json(session)
        : Response.json({ error: "not_found" }, { status: 404 });
    }

    if (request.method === "PUT") {
      await this.ctx.storage.put(key, (await request.json()) as UploadSession);
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      await this.ctx.storage.delete(key);
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
