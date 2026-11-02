import { gatewayHealth } from "./health";

export function handleRequest(request: Request): Response {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json(gatewayHealth());
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}
