export interface Env {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  DRIVE_FOLDER_ID: string;
  INTERNAL_KEY: string;
  RETRY_BASE_MS: string;
  TOKEN_REFRESH_DELAY_MS: string;
  TOKEN_KEEPER: DurableObjectNamespace;
  SESSIONS: DurableObjectNamespace;
}
