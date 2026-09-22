import { Layout } from "./Layout";

type ApiKeyCreatedProps = {
  name: string;
  apiKey: string;
};

export const ApiKeyCreated = ({ name, apiKey }: ApiKeyCreatedProps) => (
  <Layout title="APIキーを発行しました">
    <h1>APIキーを発行しました</h1>
    <div class="card">
      <p>
        「{name}」のAPIキーです。この画面を閉じるとキーは再表示できません。今すぐ安全な場所に控えてください。
      </p>
      <p class="api-key-value">
        <code>{apiKey}</code>
      </p>
      <p class="links">
        <a href="/settings/api-keys">APIキー一覧へ戻る</a>
      </p>
    </div>
  </Layout>
);
