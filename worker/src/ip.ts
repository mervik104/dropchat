import { sha256Hex } from "./crypto";

export function normalizeIp(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (!value.includes(":")) {
    return value;
  }

  const withoutZone = value.split("%")[0]!;
  const address = withoutZone.replace(/^\[([^\]]+)\]$/, "$1");
  const [head, tail] = address.split("::");
  const headParts = head === "" ? [] : head.split(":");
  const tailParts = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = Math.max(0, 8 - headParts.length - tailParts.length);
  const parts = [...headParts, ...Array<string>(missing).fill("0"), ...tailParts];

  return parts.slice(0, 4).map(normalizeHextet).join(":");
}

export function ipGroupFor(salt: string, ip: string): Promise<string> {
  return sha256Hex(`${salt}${normalizeIp(ip)}`);
}

function normalizeHextet(value: string): string {
  return value.replace(/^0+/, "") || "0";
}
