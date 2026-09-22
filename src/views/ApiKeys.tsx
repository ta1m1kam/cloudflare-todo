import { Layout } from "./Layout";
import type { ApiKey } from "../db";
import { MAX_API_KEYS_PER_USER } from "../apiKeys";

type ApiKeysProps = {
  email: string;
  apiKeys: ApiKey[];
  error?: string;
};

const formatTimestamp = (value: number | null): string =>
  value === null ? "-" : new Date(value).toISOString().slice(0, 16).replace("T", " ");

export const ApiKeys = ({ email, apiKeys, error }: ApiKeysProps) => (
  <Layout title="APIキー">
    <div class="toolbar">
      <h1>{email} のAPIキー</h1>
      <a href="/">Todo一覧へ戻る</a>
    </div>
    <div class="card">
      {error ? <p class="error">{error}</p> : null}
      <form method="post" action="/settings/api-keys" class="api-key-form">
        <label>
          キーの名前
          <input type="text" name="name" maxlength={50} placeholder="例: 自作スクリプト" required />
        </label>
        <fieldset class="scopes">
          <legend>スコープ</legend>
          <label class="checkbox">
            <input type="checkbox" checked disabled />
            todos:read（必須）
          </label>
          <label class="checkbox">
            <input type="checkbox" name="write" value="on" />
            todos:write（Todoの作成・更新・削除）
          </label>
        </fieldset>
        <label>
          有効期限
          <select name="expires">
            <option value="30">30日</option>
            <option value="90">90日</option>
            <option value="never" selected>
              無期限
            </option>
          </select>
        </label>
        <button type="submit">キーを発行する</button>
      </form>
      <p class="hint">1ユーザーにつき最大{MAX_API_KEYS_PER_USER}本まで発行できます。</p>
      {apiKeys.length === 0 ? (
        <p class="empty">APIキーはまだありません</p>
      ) : (
        <div class="table-scroll">
          <table class="api-key-table">
            <thead>
              <tr>
                <th>名前</th>
                <th>プレフィックス</th>
                <th>スコープ</th>
                <th>有効期限 (UTC)</th>
                <th>最終利用 (UTC)</th>
                <th>作成日時 (UTC)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((apiKey) => (
                <tr key={apiKey.id}>
                  <td>{apiKey.name}</td>
                  <td>
                    <code>{apiKey.key_prefix}</code>
                  </td>
                  <td>{apiKey.scopes}</td>
                  <td>{apiKey.expires_at === null ? "無期限" : formatTimestamp(apiKey.expires_at)}</td>
                  <td>{formatTimestamp(apiKey.last_used_at)}</td>
                  <td>{formatTimestamp(apiKey.created_at)}</td>
                  <td>
                    <form method="post" action={`/settings/api-keys/${apiKey.id}/delete`}>
                      <button type="submit" class="danger">
                        失効
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </Layout>
);
