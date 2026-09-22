import { Layout } from "./Layout";
import type { Todo } from "../db";

type TodoListProps = {
  email: string;
  todos: Todo[];
  error?: string;
};

export const TodoList = ({ email, todos, error }: TodoListProps) => (
  <Layout title="Todo一覧">
    <div class="toolbar">
      <h1>{email} のTodo</h1>
      <form method="post" action="/logout">
        <button type="submit" class="secondary">
          ログアウト
        </button>
      </form>
    </div>
    <div class="card">
      {error ? <p class="error">{error}</p> : null}
      <form method="post" action="/todos" class="add-form">
        <input type="text" name="title" placeholder="やることを入力" maxlength={200} required />
        <button type="submit">追加</button>
      </form>
      {todos.length === 0 ? (
        <p class="empty">Todoはまだありません</p>
      ) : (
        <ul class="todo-list">
          {todos.map((todo) => (
            <li class={todo.completed ? "todo-item completed" : "todo-item"} key={todo.id}>
              <span class="todo-title">{todo.title}</span>
              <form method="post" action={`/todos/${todo.id}/toggle`}>
                <button type="submit" class="secondary">
                  {todo.completed ? "未完了に戻す" : "完了にする"}
                </button>
              </form>
              <form method="post" action={`/todos/${todo.id}/delete`}>
                <button type="submit" class="danger">
                  削除
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  </Layout>
);
