import type { User } from "./db";

export type ApiKeyContext = { id: string; scopes: string[] };

export type AppEnv = {
  Bindings: Env;
  Variables: { user: User; apiKey?: ApiKeyContext };
};
