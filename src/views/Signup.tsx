import { Layout } from "./Layout";

type SignupProps = {
  email?: string;
  error?: string;
};

export const Signup = ({ email = "", error }: SignupProps) => (
  <Layout title="新規登録">
    <h1>新規登録</h1>
    <div class="card">
      {error ? <p class="error">{error}</p> : null}
      <form method="post" action="/signup">
        <label>
          メールアドレス
          <input type="email" name="email" value={email} required />
        </label>
        <label>
          パスワード（8文字以上）
          <input type="password" name="password" required />
        </label>
        <button type="submit">登録する</button>
      </form>
      <p class="links">
        アカウントをお持ちの方は<a href="/login">ログイン</a>へ
      </p>
    </div>
  </Layout>
);
