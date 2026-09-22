import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { hashApiKey, parseScopes } from "./apiKeys";
import { findApiKeyWithUser, touchApiKeyLastUsed } from "./db";
import type { AppEnv } from "./env";

const BEARER_PATTERN = /^Bearer\s+(\S+)$/;
const UNAUTHORIZED_HEADERS = { "WWW-Authenticate": 'Bearer realm="api"' };

export const apiError = (
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  headers?: Record<string, string>,
) => c.json({ error: { code, message } }, status, headers);

export const apiNotFound = (c: Context) =>
  apiError(c, 404, "not_found", "リソースが見つかりません");

export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const match = BEARER_PATTERN.exec(c.req.header("Authorization") ?? "");
  if (!match) {
    return apiError(
      c,
      401,
      "unauthorized",
      "Authorization ヘッダに Bearer のAPIキーが必要です",
      UNAUTHORIZED_HEADERS,
    );
  }
  const found = await findApiKeyWithUser(c.env.DB, await hashApiKey(match[1]));
  if (!found) {
    return apiError(c, 401, "unauthorized", "APIキーが無効です", UNAUTHORIZED_HEADERS);
  }
  const now = Date.now();
  if (found.apiKey.expires_at !== null && found.apiKey.expires_at <= now) {
    return apiError(c, 401, "unauthorized", "APIキーの有効期限が切れています", UNAUTHORIZED_HEADERS);
  }
  await touchApiKeyLastUsed(c.env.DB, found.apiKey.id, now);
  c.set("user", found.user);
  c.set("apiKey", { id: found.apiKey.id, scopes: parseScopes(found.apiKey.scopes) });
  await next();
});

export const requireScope = (scope: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("apiKey")?.scopes.includes(scope)) {
      return apiError(c, 403, "forbidden", `このAPIキーには ${scope} スコープがありません`);
    }
    await next();
  });

export const rateLimitApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const apiKey = c.get("apiKey");
  if (apiKey) {
    const { success } = await c.env.API_RATE_LIMITER.limit({ key: apiKey.id });
    if (!success) {
      return apiError(c, 429, "rate_limited", "リクエストが多すぎます。しばらく待ってから再試行してください", {
        "Retry-After": "60",
      });
    }
  }
  await next();
});
