import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  generateSalt,
  hashPassword,
  verifyPassword,
} from "./auth";
import {
  deleteSession,
  deleteTodo,
  findSessionWithUser,
  findTodo,
  findUserByEmail,
  insertSession,
  insertTodo,
  insertUser,
  listTodos,
  toggleTodo,
  updateTodoImageKey,
} from "./db";
import type { User } from "./db";
import { deleteTodoImage, getTodoImage, putTodoImage } from "./storage";
import { validateCredentials, validateImage, validateTodoTitle } from "./validation";
import { Login } from "./views/Login";
import { Signup } from "./views/Signup";
import { TodoList } from "./views/TodoList";

type AppEnv = { Bindings: Env; Variables: { user: User } };

const LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";

const isSecureRequest = (c: Context): boolean => new URL(c.req.url).protocol === "https:";

const clearSessionCookie = (c: Context) => {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/", secure: isSecureRequest(c) });
};

const startSession = async (c: Context<AppEnv>, userId: string) => {
  const sessionId = crypto.randomUUID();
  await insertSession(c.env.DB, sessionId, userId, Date.now() + SESSION_TTL_MS);
  setCookie(c, SESSION_COOKIE_NAME, sessionId, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
    secure: isSecureRequest(c),
  });
};

const readFormField = async (c: Context, name: string): Promise<string> => {
  const value = (await c.req.parseBody())[name];
  return typeof value === "string" ? value.trim() : "";
};

const readFormImage = async (c: Context, name: string): Promise<File | null> => {
  const value = (await c.req.parseBody())[name];
  return value instanceof File && value.size > 0 ? value : null;
};

const TODO_NOT_FOUND_MESSAGE = "Todoが見つかりません";
const IMAGE_NOT_FOUND_MESSAGE = "画像が見つかりません";
const IMAGE_REQUIRED_MESSAGE = "画像ファイルを選択してください";

const renderTodoList = async (c: Context<AppEnv>, error?: string) => {
  const user = c.get("user");
  const todos = await listTodos(c.env.DB, user.id);
  return c.html(<TodoList email={user.email} todos={todos} error={error} />);
};

const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) {
    return c.redirect("/login");
  }
  const session = await findSessionWithUser(c.env.DB, sessionId);
  if (!session) {
    clearSessionCookie(c);
    return c.redirect("/login");
  }
  if (session.expires_at <= Date.now()) {
    await deleteSession(c.env.DB, sessionId);
    clearSessionCookie(c);
    return c.redirect("/login");
  }
  c.set("user", session);
  await next();
});

const app = new Hono<AppEnv>();

app.use("*", csrf());
app.use("/", requireAuth);
app.use("/todos", requireAuth);
app.use("/todos/*", requireAuth);
app.use("/logout", requireAuth);

app.get("/signup", (c) => c.html(<Signup />));

app.post("/signup", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const validationError = validateCredentials(email, password);
  if (validationError) {
    return c.html(<Signup email={email} error={validationError} />);
  }
  if (await findUserByEmail(c.env.DB, email)) {
    return c.html(<Signup email={email} error="このメールアドレスは既に登録されています" />);
  }

  const salt = generateSalt();
  const user = await insertUser(c.env.DB, {
    id: crypto.randomUUID(),
    email,
    password_hash: await hashPassword(password, salt),
    salt,
  });
  await startSession(c, user.id);
  return c.redirect("/");
});

app.get("/login", (c) => c.html(<Login />));

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = await findUserByEmail(c.env.DB, email);
  if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
    return c.html(<Login email={email} error={LOGIN_FAILED_MESSAGE} />);
  }

  await startSession(c, user.id);
  return c.redirect("/");
});

app.post("/logout", async (c) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionId) {
    await deleteSession(c.env.DB, sessionId);
  }
  clearSessionCookie(c);
  return c.redirect("/login");
});

app.get("/", (c) => renderTodoList(c));

app.post("/todos", async (c) => {
  const user = c.get("user");
  const title = await readFormField(c, "title");
  const image = await readFormImage(c, "image");
  const validationError = validateTodoTitle(title) ?? (image ? validateImage(image) : null);
  if (validationError) {
    return renderTodoList(c, validationError);
  }
  const todoId = crypto.randomUUID();
  const imageKey = image ? await putTodoImage(c.env.IMAGES, user.id, todoId, image) : null;
  await insertTodo(c.env.DB, {
    id: todoId,
    user_id: user.id,
    title,
    image_key: imageKey,
  });
  return c.redirect("/");
});

app.post("/todos/:id/toggle", async (c) => {
  const user = c.get("user");
  if (!(await toggleTodo(c.env.DB, c.req.param("id"), user.id))) {
    return c.text(TODO_NOT_FOUND_MESSAGE, 404);
  }
  return c.redirect("/");
});

app.post("/todos/:id/delete", async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (!todo) {
    return c.text(TODO_NOT_FOUND_MESSAGE, 404);
  }
  await deleteTodo(c.env.DB, todo.id, user.id);
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
  }
  return c.redirect("/");
});

app.get("/todos/:id/image", async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (!todo?.image_key) {
    return c.text(IMAGE_NOT_FOUND_MESSAGE, 404);
  }
  const object = await getTodoImage(c.env.IMAGES, todo.image_key);
  if (!object) {
    return c.text(IMAGE_NOT_FOUND_MESSAGE, 404);
  }
  return c.body(object.body, 200, {
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=0",
  });
});

app.post("/todos/:id/image", async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (!todo) {
    return c.text(TODO_NOT_FOUND_MESSAGE, 404);
  }
  const image = await readFormImage(c, "image");
  if (!image) {
    return renderTodoList(c, IMAGE_REQUIRED_MESSAGE);
  }
  const validationError = validateImage(image);
  if (validationError) {
    return renderTodoList(c, validationError);
  }
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
  }
  const imageKey = await putTodoImage(c.env.IMAGES, user.id, todo.id, image);
  await updateTodoImageKey(c.env.DB, todo.id, user.id, imageKey);
  return c.redirect("/");
});

app.post("/todos/:id/image/delete", async (c) => {
  const user = c.get("user");
  const todo = await findTodo(c.env.DB, c.req.param("id"), user.id);
  if (!todo) {
    return c.text(TODO_NOT_FOUND_MESSAGE, 404);
  }
  if (todo.image_key) {
    await deleteTodoImage(c.env.IMAGES, todo.image_key);
    await updateTodoImageKey(c.env.DB, todo.id, user.id, null);
  }
  return c.redirect("/");
});

export default app;
