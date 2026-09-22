import { toHex } from "./auth";
import { toBase64Url } from "./encoding";

const API_KEY_BYTES = 32;
const KEY_PREFIX_LENGTH = 12;
const EXPIRY_DAYS: Record<string, number> = { "30": 30, "90": 90 };
const DAY_MS = 24 * 60 * 60 * 1000;

export const API_KEY_PREFIX = "ctd_";
export const MAX_API_KEYS_PER_USER = 10;
export const SCOPE_TODOS_READ = "todos:read";
export const SCOPE_TODOS_WRITE = "todos:write";

export const generateApiKey = (): string =>
  API_KEY_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(API_KEY_BYTES)));

export const hashApiKey = async (key: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key))));

export const apiKeyPrefix = (key: string): string => key.slice(0, KEY_PREFIX_LENGTH);

export const parseScopes = (scopes: string): string[] => scopes.split(" ").filter(Boolean);

export const buildScopes = (writable: boolean): string =>
  writable ? `${SCOPE_TODOS_READ} ${SCOPE_TODOS_WRITE}` : SCOPE_TODOS_READ;

export const expiresAtFromOption = (option: string): number | null => {
  const days = EXPIRY_DAYS[option];
  return days === undefined ? null : Date.now() + days * DAY_MS;
};
