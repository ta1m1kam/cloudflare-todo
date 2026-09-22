import { Layout } from "./Layout";

type LoginProps = {
  email?: string;
  error?: string;
};

export const Login = ({ email = "", error }: LoginProps) => (
  <Layout title="ログイン">
    <h1>ログイン</h1>
    <div class="card">
      {error ? <p class="error">{error}</p> : null}
      <form method="post" action="/login">
        <label>
          メールアドレス
          <input type="email" name="email" value={email} required />
        </label>
        <label>
          パスワード
          <input type="password" name="password" required />
        </label>
        <button type="submit">ログイン</button>
      </form>
      <p class="links">
        アカウントをお持ちでない方は<a href="/signup">新規登録</a>へ
      </p>
    </div>
  </Layout>
);
