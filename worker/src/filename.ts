const SAFE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

export function sanitizeFilename(name: string): string {
  const basename = name.split(/[\\/]/).pop()!;
  const cleaned = [...basename]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127 && !'<>:"|?*'.includes(character);
    })
    .join("")
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "file";
}

export function safeDownloadHeaders(name: string, mime: string): Headers {
  const filename = sanitizeFilename(name);
  const inline = SAFE_IMAGE_TYPES.has(mime.toLowerCase());
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  const headers = new Headers();
  headers.set("content-type", inline ? mime.toLowerCase() : "application/octet-stream");
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "content-disposition",
    `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  return headers;
}
