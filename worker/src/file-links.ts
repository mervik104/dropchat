import { constantTimeEqual } from "./crypto";

export async function createDownloadToken(
  fileId: string,
  deviceId: string,
  exp: number,
  key: string,
): Promise<string> {
  const signature = await sign(`${fileId}.${deviceId}.${exp}`, key);
  return `${exp}.${deviceId}.${signature}`;
}

export async function verifyDownloadToken(
  token: string,
  fileId: string,
  now: number,
  key: string,
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [expRaw, deviceId, signature] = parts;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp <= now || !deviceId || !signature) {
    return null;
  }

  const expected = await sign(`${fileId}.${deviceId}.${exp}`, key);
  return constantTimeEqual(expected, signature) ? deviceId : null;
}

async function sign(value: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
