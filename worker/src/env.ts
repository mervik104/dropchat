export interface Env {
  DB: D1Database;
  HUB: DurableObjectNamespace;
  DRIVE: Fetcher;
  SERVER_SALT: string;
  DOWNLOAD_SIGNING_KEY: string;
  INTERNAL_KEY: string;
  CLOUD_UPLOADS_ENABLED: string;
  RETENTION_DAYS: string;
  MAX_FILE_SIZE: string;
  PER_DEVICE_UPLOAD_PER_24H: string;
  PER_DEVICE_STORED_TOTAL: string;
  GLOBAL_STORED_TOTAL: string;
  MAX_MESSAGE_LENGTH: string;
  MESSAGE_LIMIT_PER_MINUTE: string;
  PROFILE_UPDATE_LIMIT_PER_HOUR: string;
  REGISTRATION_LIMIT_PER_HOUR: string;
  WS_TICKET_LIMIT_PER_MINUTE: string;
  WEB_ORIGIN: string;
}
