export type User = {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: number;
};

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
  todo: Pick<Todo, "id" | "user_id" | "title" | "image_key">,
): Promise<void> => {
  await db
    .prepare(
      "INSERT INTO todos (id, user_id, title, completed, image_key, created_at) VALUES (?, ?, ?, 0, ?, ?)",
    )
    .bind(todo.id, todo.user_id, todo.title, todo.image_key, Date.now())
    .run();
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
