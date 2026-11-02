import type {
  DriveHealthResponse,
  StorageAdapter,
  StorageInitResult,
  StoragePartResult,
} from "@dropchat/shared";

const BASE_URL = "https://drive-gateway";

export class DriveGatewayError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs = 0,
  ) {
    super("storage_failed");
    this.name = "DriveGatewayError";
  }
}

function retryAfterMs(response: Response): number {
  const value = response.headers.get("retry-after");
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function throwStorageError(response: Response): never {
  throw new DriveGatewayError(response.status, retryAfterMs(response));
}

export class DriveGatewayAdapter implements StorageAdapter {
  constructor(
    private readonly fetcher: Fetcher,
    private readonly internalKey: string,
  ) {}

  async init(size: number, mime: string): Promise<StorageInitResult> {
    const response = await this.fetcher.fetch(`${BASE_URL}/init`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Internal-Key": this.internalKey,
      },
      body: JSON.stringify({ size, mime }),
    });

    if (!response.ok) {
      throwStorageError(response);
    }

    return (await response.json()) as StorageInitResult;
  }

  async putPart(
    sessionId: string,
    chunk: Uint8Array,
    contentRange: string,
  ): Promise<StoragePartResult> {
    const response = await this.fetcher.fetch(
      `${BASE_URL}/parts/${encodeURIComponent(sessionId)}`,
      {
        method: "PUT",
        headers: {
          "content-range": contentRange,
          "X-Internal-Key": this.internalKey,
        },
        body: chunk,
      },
    );

    if (!response.ok) {
      throwStorageError(response);
    }

    return (await response.json()) as StoragePartResult;
  }

  async getStream(driveFileId: string, range?: string): Promise<Response> {
    const response = await this.fetcher.fetch(
      `${BASE_URL}/files/${encodeURIComponent(driveFileId)}`,
      {
        headers: {
          "X-Internal-Key": this.internalKey,
          ...(range ? { Range: range } : {}),
        },
      },
    );

    if (!response.ok) {
      throw new Error("storage_failed");
    }

    return response;
  }

  async delete(driveFileId: string): Promise<void> {
    const response = await this.fetcher.fetch(
      `${BASE_URL}/files/${encodeURIComponent(driveFileId)}`,
      {
        method: "DELETE",
        headers: { "X-Internal-Key": this.internalKey },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error("storage_failed");
    }
  }

  async health(): Promise<DriveHealthResponse> {
    const response = await this.fetcher.fetch(`${BASE_URL}/health`, {
      headers: { "X-Internal-Key": this.internalKey },
    });

    if (!response.ok) {
      throw new Error("storage_failed");
    }

    return (await response.json()) as DriveHealthResponse;
  }

  async cancel(sessionId: string): Promise<void> {
    const response = await this.fetcher.fetch(
      `${BASE_URL}/parts/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: { "X-Internal-Key": this.internalKey },
      },
    );

    if (!response.ok && response.status !== 404) {
      throw new Error("storage_failed");
    }
  }
}
