import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import {
  buildAuthUrl,
  createDropChatFolder,
  exchangeCode,
  parseDotEnv,
} from "./google-auth.mjs";

const DOT_ENV_PATH = "drive-gateway/.dev.vars";

if (existsSync(DOT_ENV_PATH)) {
  const values = parseDotEnv(readFileSync(DOT_ENV_PATH, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    "Не найдены GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET. Положите их в drive-gateway/.dev.vars.",
  );
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
let redirectUri = "";
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname !== "/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    if (url.searchParams.get("state") !== state) {
      response.writeHead(400).end("Invalid state");
      return;
    }

    const code = url.searchParams.get("code");
    if (!code) {
      response.writeHead(400).end("Missing code");
      return;
    }

    const tokens = await exchangeCode({
      clientId,
      clientSecret,
      code,
      redirectUri,
    });
    const folderId = await createDropChatFolder({
      accessToken: tokens.access_token,
    });

    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("DropChat: готово. Можно закрыть вкладку.");

    console.log("");
    console.log("Добавьте в drive-gateway/.dev.vars:");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`DRIVE_FOLDER_ID=${folderId}`);
    console.log("");
    console.log("Для деплоя используйте wrangler secret put (см. гайд).");

    server.close();
  } catch (error) {
    response.writeHead(500).end("OAuth flow failed");
    console.error(
      error instanceof Error ? error.message : "OAuth flow failed",
    );
    server.close();
    process.exitCode = 1;
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("Failed to bind loopback server");
  }

  redirectUri = `http://127.0.0.1:${address.port}/callback`;
  console.log("Откройте ссылку в браузере и разрешите доступ:");
  console.log(buildAuthUrl({ clientId, redirectUri, state }));
  console.log("");
  console.log("Ожидаю callback на 127.0.0.1...");
});
