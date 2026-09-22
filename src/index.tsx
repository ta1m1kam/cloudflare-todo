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
  findUserByEmail,
  insertSession,
  insertTodo,
  insertUser,
  listTodos,
  toggleTodo,
} from "./db";
import type { User } from "./db";
import { validateCredentials, validateTodoTitle } from "./validation";
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

app.get("/", async (c) => {
  const user = c.get("user");
  const todos = await listTodos(c.env.DB, user.id);
  return c.html(<TodoList email={user.email} todos={todos} />);
});

app.post("/todos", async (c) => {
  const user = c.get("user");
  const title = await readFormField(c, "title");
  const validationError = validateTodoTitle(title);
  if (validationError) {
    const todos = await listTodos(c.env.DB, user.id);
    return c.html(<TodoList email={user.email} todos={todos} error={validationError} />);
  }
  await insertTodo(c.env.DB, user.id, title);
  return c.redirect("/");
});

app.post("/todos/:id/toggle", async (c) => {
  const user = c.get("user");
  if (!(await toggleTodo(c.env.DB, c.req.param("id"), user.id))) {
    return c.text("Todoが見つかりません", 404);
  }
  return c.redirect("/");
});

app.post("/todos/:id/delete", async (c) => {
  const user = c.get("user");
  if (!(await deleteTodo(c.env.DB, c.req.param("id"), user.id))) {
    return c.text("Todoが見つかりません", 404);
  }
  return c.redirect("/");
});

export default app;
