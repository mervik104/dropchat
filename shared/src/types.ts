export type RuntimeName = "worker" | "drive-gateway";

export interface HelloResponse {
  app: string;
  protocol: number;
  runtime: RuntimeName;
}
