import { handleRequest } from "./router";
import { SessionStore } from "./session-store";
import { TokenKeeper } from "./token-keeper";

export { SessionStore, TokenKeeper };

export default {
  fetch: handleRequest,
};
