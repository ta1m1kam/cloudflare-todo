import { Hono } from "hono";
import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { apiError, apiNotFound, rateLimitApiKey, requireApiKey, requireScope } from "./apiAuth";
import { SCOPE_TODOS_READ, SCOPE_TODOS_WRITE } from "./apiKeys";
import {
  deleteTodo,
  findTodo,
  insertTodo,
  listTodosPage,
  updateTodo,
  updateTodoImageKey,
} from "./db";
import type { Todo, TodoCursor } from "./db";
import { decodeBase64UrlText, encodeBase64UrlText } from "./encoding";
import type { AppEnv } from "./env";
import { deleteTodoImage, getTodoImage, putTodoImage } from "./storage";
import { validateImage } from "./validation";

const MAX_BODY_SIZE = 6 * 1024 * 1024;
const MAX_TITLE_LENGTH = 200;

type ValidationIssues = { issues: readonly { path: readonly PropertyKey[]; message: string }[] };

const issuesMessage = (error: ValidationIssues): string =>
  error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join(", ");

const invalidRequest = (c: Context, error: ValidationIssues) =>
  apiError(c, 400, "validation_error", issuesMessage(error));

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  completed: z.boolean().optional(),
});

const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
    completed: z.boolean().optional(),
  })
  .refine((value) => value.title !== undefined || value.completed !== undefined, {
    message: "title または completed のいずれかを指定してください",
  });

const toTodoJson = (todo: Todo) => ({
  id: todo.id,
  title: todo.title,
  completed: todo.completed === 1,
  image_url: todo.image_key ? `/api/v1/todos/${todo.id}/image` : null,
  created_at: new Date(todo.created_at).toISOString(),
});

const encodeCursor = (todo: Todo): string => encodeBase64UrlText(`${todo.created_at}:${todo.id}`);

const decodeCursor = (cursor: string): TodoCursor | null => {
  const decoded = decodeBase64UrlText(cursor);
  const separator = decoded === null ? -1 : decoded.indexOf(":");
  if (decoded === null || separator < 0) {
    return null;
  }
  const createdAt = Number(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  return Number.isSafeInteger(createdAt) && id.length > 0 ? { created_at: createdAt, id } : null;
};

export const api = new Hono<AppEnv>();

api.use(
  "*",
  bodyLimit({
    maxSize: MAX_BODY_SIZE,
    onError: (c) =>
      apiError(c, 413, "payload_too_large", "リクエストボディが大きすぎます（上限6MB）"),
  }),
);
api.use("*", requireApiKey);
api.use("*", rateLimitApiKey);

api.onError((error, c) =>
  error instanceof HTTPException
    ? apiError(c, 400, "validation_error", "リクエストの形式が正しくありません")
    : apiError(c, 500, "internal_error", "サーバーエラーが発生しました"),
);

api.get("/me", requireScope(SCOPE_TODOS_READ), (c) => {
  const user = c.get("user");
  return c.json({ id: user.id, email: user.email });
});

api.get(
  "/todos",
  requireScope(SCOPE_TODOS_READ),
  zValidator("query", listQuerySchema, (result, c) =>
    result.success ? undefined : invalidRequest(c, result.error),
  ),
  async (c) => {
    const { limit, cursor } = c.req.valid("query");
    const decoded = cursor === undefined ? null : decodeCursor(cursor);
    if (cursor !== undefined && decoded === null) {
      return apiError(c, 400, "validation_error", "cursor の形式が正しくありません");
    }
    const todos = await listTodosPage(c.env.DB, c.get("user").id, limit + 1, decoded);
    const items = todos.slice(0, limit);
    const last = todos.length > limit ? items[items.length - 1] : null;
    return c.json({
      items: items.map(toTodoJson),
      next_cursor: last === null ? null : encodeCursor(last),
    });
  },
);

api.post(
  "/todos",
  requireScope(SCOPE_TODOS_WRITE),
  zValidator("json", createTodoSchema, (result, c) =>
    result.success ? undefined : invalidRequest(c, result.error),
  ),
  async (c) => {
    const user = c.get("user");
    const { title, completed } = c.req.valid("json");
    const todo = await insertTodo(c.env.DB, {
      id: crypto.randomUUID(),
      user_id: user.id,
      title,
      image_key: null,
      completed: completed === true ? 1 : 0,
    });
    return c.json(toTodoJson(todo), 201);
  },
);

api.get("/todos/:id", requireScope(SCOPE_TODOS_READ), async (c) => {
  const todo = await findTodo(c.env.DB, c.req.param("id"), c.get("user").id);
  return todo === null ? apiNotFound(c) : c.json(toTodoJson(todo));
});

api.patch(
  "/todos/:id",
  requireScope(SCOPE_TODOS_WRITE),
  zValidator("json", updateTodoSchema, (result, c) =>
    result.success ? undefined : invalidRequest(c, result.error),
  ),
  async (c) => {
    const user = c.get("user");
    const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
    if (todo === null) {
      return apiNotFound(c);
    }
    const { title, completed } = c.req.valid("json");
    await updateTodo(c.env.DB, todo.id, user.id, { title, completed });
    const updated = await findTodo(c.env.DB, todo.id, user.id);
    return updated === null ? apiNotFound(c) : c.json(toTodoJson(updated));
  },
);

api.delete("/todos/:id", requireScope(SCOPE_TODOS_WRITE), async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (todo === null) {
    return apiNotFound(c);
  }
  await deleteTodo(c.env.DB, todo.id, user.id);
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
  }
  return c.body(null, 204);
});

api.get("/todos/:id/image", requireScope(SCOPE_TODOS_READ), async (c) => {
  const todo = await findTodo(c.env.DB, c.req.param("id"), c.get("user").id);
  if (!todo?.image_key) {
    return apiNotFound(c);
  }
  const object = await getTodoImage(c.env.IMAGES, todo.image_key);
  if (object === null) {
    return apiNotFound(c);
  }
  return c.body(object.body, 200, {
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=0",
  });
});

api.put("/todos/:id/image", requireScope(SCOPE_TODOS_WRITE), async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (todo === null) {
    return apiNotFound(c);
  }
  const image = (await c.req.parseBody()).image;
  if (!(image instanceof File) || image.size === 0) {
    return apiError(c, 400, "validation_error", "image フィールドに画像ファイルが必要です");
  }
  const imageError = validateImage(image);
  if (imageError !== null) {
    return apiError(c, 400, "validation_error", imageError);
  }
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
  }
  const imageKey = await putTodoImage(c.env.IMAGES, user.id, todo.id, image);
  await updateTodoImageKey(c.env.DB, todo.id, user.id, imageKey);
  return c.json(toTodoJson({ ...todo, image_key: imageKey }));
});

api.delete("/todos/:id/image", requireScope(SCOPE_TODOS_WRITE), async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (todo === null) {
    return apiNotFound(c);
  }
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
    await updateTodoImageKey(c.env.DB, todo.id, user.id, null);
  }
  return c.body(null, 204);
});

api.all("*", (c) => apiNotFound(c));
