export type User = {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: number;
};

export type ApiKey = {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string;
  expires_at: number | null;
  last_used_at: number | null;
  created_at: number;
};

export type TodoCursor = { created_at: number; id: string };

const API_KEY_LAST_USED_INTERVAL_MS = 60 * 1000;

export type Todo = {
  id: string;
  user_id: string;
  title: string;
  completed: number;
  image_key: string | null;
  created_at: number;
};

export const findUserByEmail = (db: D1Database, email: string): Promise<User | null> =>
  db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<User>();

export const insertUser = async (
  db: D1Database,
  user: Omit<User, "created_at">,
): Promise<User> => {
  const createdAt = Date.now();
  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(user.id, user.email, user.password_hash, user.salt, createdAt)
    .run();
  return { ...user, created_at: createdAt };
};

export const insertSession = async (
  db: D1Database,
  id: string,
  userId: string,
  expiresAt: number,
): Promise<void> => {
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(id, userId, expiresAt)
    .run();
};

export const findSessionWithUser = (
  db: D1Database,
  sessionId: string,
): Promise<(User & { expires_at: number }) | null> =>
  db
    .prepare(
      "SELECT users.*, sessions.expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?",
    )
    .bind(sessionId)
    .first<User & { expires_at: number }>();

export const deleteSession = async (db: D1Database, sessionId: string): Promise<void> => {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
};

export const listTodos = async (db: D1Database, userId: string): Promise<Todo[]> => {
  const { results } = await db
    .prepare("SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<Todo>();
  return results;
};

export const findTodo = (
  db: D1Database,
  todoId: string,
  userId: string,
): Promise<Todo | null> =>
  db
    .prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?")
    .bind(todoId, userId)
    .first<Todo>();

export const insertTodo = async (
  db: D1Database,
  todo: Pick<Todo, "id" | "user_id" | "title" | "image_key"> & { completed?: number },
): Promise<Todo> => {
  const createdAt = Date.now();
  const completed = todo.completed ?? 0;
  await db
    .prepare(
      "INSERT INTO todos (id, user_id, title, completed, image_key, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(todo.id, todo.user_id, todo.title, completed, todo.image_key, createdAt)
    .run();
  return { ...todo, completed, created_at: createdAt };
};

export const updateTodoImageKey = async (
  db: D1Database,
  todoId: string,
  userId: string,
  imageKey: string | null,
): Promise<boolean> => {
  const { meta } = await db
    .prepare("UPDATE todos SET image_key = ? WHERE id = ? AND user_id = ?")
    .bind(imageKey, todoId, userId)
    .run();
  return meta.changes > 0;
};

export const toggleTodo = async (
  db: D1Database,
  todoId: string,
  userId: string,
): Promise<boolean> => {
  const { meta } = await db
    .prepare("UPDATE todos SET completed = 1 - completed WHERE id = ? AND user_id = ?")
    .bind(todoId, userId)
    .run();
  return meta.changes > 0;
};

export const deleteTodo = async (
  db: D1Database,
  todoId: string,
  userId: string,
): Promise<boolean> => {
  const { meta } = await db
    .prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
    .bind(todoId, userId)
    .run();
  return meta.changes > 0;
};

export const listTodosPage = async (
  db: D1Database,
  userId: string,
  limit: number,
  cursor: TodoCursor | null,
): Promise<Todo[]> => {
  const statement = cursor
    ? db
        .prepare(
          "SELECT * FROM todos WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?",
        )
        .bind(userId, cursor.created_at, cursor.created_at, cursor.id, limit)
    : db
        .prepare(
          "SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
        )
        .bind(userId, limit);
  const { results } = await statement.all<Todo>();
  return results;
};

export const updateTodo = async (
  db: D1Database,
  todoId: string,
  userId: string,
  fields: { title?: string; completed?: boolean },
): Promise<boolean> => {
  const { meta } = await db
    .prepare(
      "UPDATE todos SET title = COALESCE(?, title), completed = COALESCE(?, completed) WHERE id = ? AND user_id = ?",
    )
    .bind(
      fields.title ?? null,
      fields.completed === undefined ? null : Number(fields.completed),
      todoId,
      userId,
    )
    .run();
  return meta.changes > 0;
};

export const listApiKeys = async (db: D1Database, userId: string): Promise<ApiKey[]> => {
  const { results } = await db
    .prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<ApiKey>();
  return results;
};

export const countApiKeys = async (db: D1Database, userId: string): Promise<number> => {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM api_keys WHERE user_id = ?")
    .bind(userId)
    .first<{ count: number }>();
  return row?.count ?? 0;
};

export const insertApiKey = async (
  db: D1Database,
  apiKey: Omit<ApiKey, "created_at">,
): Promise<ApiKey> => {
  const createdAt = Date.now();
  await db
    .prepare(
      "INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, scopes, expires_at, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      apiKey.id,
      apiKey.user_id,
      apiKey.name,
      apiKey.key_prefix,
      apiKey.key_hash,
      apiKey.scopes,
      apiKey.expires_at,
      apiKey.last_used_at,
      createdAt,
    )
    .run();
  return { ...apiKey, created_at: createdAt };
};

export const deleteApiKey = async (
  db: D1Database,
  apiKeyId: string,
  userId: string,
): Promise<boolean> => {
  const { meta } = await db
    .prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?")
    .bind(apiKeyId, userId)
    .run();
  return meta.changes > 0;
};

export const findApiKeyWithUser = async (
  db: D1Database,
  keyHash: string,
): Promise<{ apiKey: ApiKey; user: User } | null> => {
  const row = await db
    .prepare(
      "SELECT api_keys.*, users.email AS user_email, users.password_hash AS user_password_hash, users.salt AS user_salt, users.created_at AS user_created_at FROM api_keys JOIN users ON users.id = api_keys.user_id WHERE api_keys.key_hash = ?",
    )
    .bind(keyHash)
    .first<
      ApiKey & {
        user_email: string;
        user_password_hash: string;
        user_salt: string;
        user_created_at: number;
      }
    >();
  if (!row) {
    return null;
  }
  return {
    apiKey: row,
    user: {
      id: row.user_id,
      email: row.user_email,
      password_hash: row.user_password_hash,
      salt: row.user_salt,
      created_at: row.user_created_at,
    },
  };
};

export const touchApiKeyLastUsed = async (
  db: D1Database,
  apiKeyId: string,
  now: number,
): Promise<void> => {
  await db
    .prepare(
      "UPDATE api_keys SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at <= ?)",
    )
    .bind(now, apiKeyId, now - API_KEY_LAST_USED_INTERVAL_MS)
    .run();
};
