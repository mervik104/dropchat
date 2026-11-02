import { env } from "cloudflare:workers";
import {
  abortAllDurableObjects,
  applyD1Migrations,
  type D1Migration,
} from "cloudflare:test";
import { afterEach, beforeAll, beforeEach } from "vitest";

const testEnv = env as typeof env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await testEnv.DB.batch([
    testEnv.DB.prepare("DELETE FROM blocks"),
    testEnv.DB.prepare("DELETE FROM invite_failures"),
    testEnv.DB.prepare("DELETE FROM peer_requests"),
    testEnv.DB.prepare("DELETE FROM invites"),
    testEnv.DB.prepare("DELETE FROM endpoint_rate_limits"),
    testEnv.DB.prepare("DELETE FROM ws_tickets"),
    testEnv.DB.prepare("DELETE FROM messages"),
    testEnv.DB.prepare("DELETE FROM registration_rate_limits"),
    testEnv.DB.prepare("DELETE FROM peers"),
    testEnv.DB.prepare("DELETE FROM devices"),
  ]);
});

afterEach(async () => {
  await abortAllDurableObjects();
});
