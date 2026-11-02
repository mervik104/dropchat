export class Hub {
  async fetch(): Promise<Response> {
    return Response.json({ ok: true, service: "hub" });
  }
}
