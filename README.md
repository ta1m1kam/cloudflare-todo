# cloudflare-todo

Cloudflare Workers + Hono + D1 + R2 で動く、メール + パスワード認証付きの Todo アプリです。
画面は Cookie セッション、外部公開用の JSON API はパーソナル API キー (Bearer) で認証します。
Todo には画像を 1 枚まで添付でき、実体は R2、キーは D1 の `todos.image_key` に持ちます。
画面は Hono の JSX によるサーバーサイドレンダリングで、クライアント JS は使っていません。
CSS は `public/style.css` に置き、Workers Static Assets として配信します。

## セットアップと起動

```sh
pnpm install          # 依存関係のインストール
pnpm run db:migrate   # ローカル D1 にマイグレーションを適用
pnpm run dev          # http://localhost:8787 で起動
```

## 構成

```
wrangler.jsonc          Workers の設定 (D1 バインディング DB, R2 バインディング IMAGES, レートリミッター API_RATE_LIMITER, nodejs_compat, 静的アセット)
public/                 静的アセット (style.css)。Workers Static Assets で配信
migrations/             D1 のマイグレーション (users / sessions / todos / todos.image_key / api_keys)
src/
  index.tsx             画面のルーティング、セッション認証ミドルウェア、CSRF、セキュリティヘッダ、API のマウント
  api.ts                /api/v1 のサブアプリ (Todo の JSON API)
  apiAuth.ts            API キー認証・スコープ検査・レート制限のミドルウェアとエラーレスポンス
  apiKeys.ts            API キーの生成 (ctd_ + 32 バイト乱数) と SHA-256 ハッシュ、スコープと有効期限
  auth.ts               PBKDF2 (SHA-256) によるパスワードハッシュとセッション定数
  db.ts                 D1 へのクエリとレコード型
  encoding.ts           base64url のエンコードとデコード (API キーとカーソルで共用)
  env.ts                Hono の Bindings / Variables 型
  storage.ts            R2 への画像の保存・取得・削除
  validation.ts         メール形式・パスワード長・タイトル長・画像形式とサイズ・キー名のバリデーション
  views/                Layout / Login / Signup / TodoList / ApiKeys / ApiKeyCreated の JSX コンポーネント
```

## ルート

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET / POST | `/signup` | 新規登録 |
| GET / POST | `/login` | ログイン |
| POST | `/logout` | ログアウト |
| GET | `/` | Todo 一覧 (未ログインなら `/login` へリダイレクト) |
| POST | `/todos` | Todo 追加 (任意で画像を同時にアップロード) |
| POST | `/todos/:id/toggle` | 完了状態の切り替え |
| POST | `/todos/:id/delete` | 削除 (画像があれば R2 からも削除) |
| GET | `/todos/:id/image` | 添付画像の取得 |
| POST | `/todos/:id/image` | 添付画像のアップロード / 差し替え |
| POST | `/todos/:id/image/delete` | 添付画像の削除 |
| GET | `/settings/api-keys` | API キーの一覧と発行フォーム |
| POST | `/settings/api-keys` | API キーの発行 (直後の画面で 1 度だけキー本体を表示) |
| POST | `/settings/api-keys/:id/delete` | API キーの失効 (行削除) |

外部公開用の JSON API は `/api/v1` 配下にあります。詳細は「API」を参照してください。

| メソッド | パス | 必要スコープ | 説明 |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | `todos:read` | 認証中のユーザー情報 |
| GET | `/api/v1/todos` | `todos:read` | Todo 一覧 (カーソルページング) |
| POST | `/api/v1/todos` | `todos:write` | Todo の作成 (201) |
| GET | `/api/v1/todos/:id` | `todos:read` | Todo の取得 |
| PATCH | `/api/v1/todos/:id` | `todos:write` | Todo の更新 |
| DELETE | `/api/v1/todos/:id` | `todos:write` | Todo の削除 (204) |
| PUT | `/api/v1/todos/:id/image` | `todos:write` | 添付画像のアップロード / 差し替え |
| GET | `/api/v1/todos/:id/image` | `todos:read` | 添付画像の取得 |
| DELETE | `/api/v1/todos/:id/image` | `todos:write` | 添付画像の削除 (204) |

## 画像添付

- 1 つの Todo につき画像は 1 枚です。実体は R2 バケット `cloudflare-todo-images` (バインディング `IMAGES`) に置きます。
- オブジェクトキーは `${userId}/${todoId}/${uuid}` で、`todos.image_key` に保存します。差し替え時と Todo 削除時は古いオブジェクトを R2 から削除します。
- 受け付ける形式は JPEG / PNG / WebP / GIF、サイズは 5MB 以下です。違反した場合は一覧画面にエラーを表示します。
- 配信は `Content-Type` を R2 の `httpMetadata.contentType`、`Cache-Control` を `private, max-age=0` として返します。
- ローカル開発では R2 も Miniflare がエミュレートするため、リモートのバケットがなくても `wrangler dev` で動きます。

## API

`/api/v1` 配下は Cookie を一切読まない外部公開用の JSON API です。CORS は付けていないので、ブラウザの別オリジンからは呼べません。

### 認証

パーソナル API キーを `Authorization: Bearer <key>` で送ります。キーは `/settings/api-keys` から発行し、発行直後の画面でしか本体を表示しません。

```sh
curl -H "Authorization: Bearer ctd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  http://localhost:8787/api/v1/me
```

- キーの形式は `ctd_` + 32 バイト乱数の base64url で、`crypto.getRandomValues` で生成します。
- D1 には SHA-256 の hex ハッシュと先頭 12 文字 (`key_prefix`) だけを保存します。キー自体が 256bit のエントロピーを持ち、かつハッシュで検索する必要があるため、ソルトや PBKDF2 は使いません。
- 有効期限は 30 日 / 90 日 / 無期限から選べます。失効は行削除で、失効後のキーは即座に 401 になります。
- 1 ユーザーにつき最大 10 本まで発行できます。
- 最終利用日時 (`last_used_at`) は書き込みを抑えるため、前回更新から 60 秒以上経過しているときだけ更新します。

### スコープ

| スコープ | 対象 |
| --- | --- |
| `todos:read` | GET 系のエンドポイント。すべてのキーに必ず付きます |
| `todos:write` | POST / PATCH / PUT / DELETE。発行時のチェックボックスで任意に付けます |

不足している場合は 403 (`forbidden`) を返します。

### エラー形式

エラーは常に次の形です。zod のバリデーション失敗も同じ形に変換します。

```json
{ "error": { "code": "validation_error", "message": "title: Too small: expected string to have >=1 characters" } }
```

| code | ステータス | 発生する場面 |
| --- | --- | --- |
| `unauthorized` | 401 | Bearer が無い / キーが無効 / 有効期限切れ。`WWW-Authenticate: Bearer realm="api"` を付けます |
| `forbidden` | 403 | スコープ不足 |
| `not_found` | 404 | 存在しない Todo・画像、他ユーザーの Todo、未定義のパス |
| `validation_error` | 400 | リクエストボディ / クエリの不正、不正なカーソル、画像の形式や 5MB 超過 |
| `rate_limited` | 429 | レート制限超過。`Retry-After: 60` を付けます |
| `payload_too_large` | 413 | リクエストボディが 6MB 超過 |
| `internal_error` | 500 | 想定外のエラー |

### レート制限

Workers Rate Limiting (`API_RATE_LIMITER`, 60 リクエスト / 60 秒) を API キー単位で適用します。超過すると 429 と `Retry-After: 60` を返します。ローカルの `wrangler dev` でも Miniflare がエミュレートするので同じ挙動になります。

### Todo の JSON 表現

```json
{
  "id": "e02220e3-72e7-4946-a7cd-496244ac1807",
  "title": "3件目",
  "completed": true,
  "image_url": "/api/v1/todos/e02220e3-72e7-4946-a7cd-496244ac1807/image",
  "created_at": "2026-09-22T17:43:12.441Z"
}
```

`image_url` は画像が無ければ `null` です。

### 一覧とページング

`GET /api/v1/todos` は `created_at DESC, id DESC` の順で返します。`limit` は 1〜100 (既定 20)、`cursor` は `created_at` と `id` を base64url 化した不透明文字列です。次のページが無ければ `next_cursor` は `null` になります。

```sh
curl -H "Authorization: Bearer $KEY" "http://localhost:8787/api/v1/todos?limit=20"
curl -H "Authorization: Bearer $KEY" "http://localhost:8787/api/v1/todos?limit=20&cursor=MTc5MDA5ODk5MjQ0MTplMDIy..."
```

### curl の例

```sh
KEY=ctd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE=http://localhost:8787/api/v1

curl -H "Authorization: Bearer $KEY" $BASE/me

curl -X POST $BASE/todos \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"牛乳を買う"}'

curl -X PATCH $BASE/todos/$TODO_ID \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

curl -X PUT $BASE/todos/$TODO_ID/image \
  -H "Authorization: Bearer $KEY" \
  -F "image=@./photo.png"

curl -H "Authorization: Bearer $KEY" $BASE/todos/$TODO_ID/image -o photo.png

curl -X DELETE $BASE/todos/$TODO_ID/image -H "Authorization: Bearer $KEY" -i

curl -X DELETE $BASE/todos/$TODO_ID -H "Authorization: Bearer $KEY" -i
```

## 認証の仕組み

- パスワードは Web Crypto の PBKDF2 (SHA-256 / 100,000 回) でハッシュ化し、16 バイトのソルトと共に保存します。
- 検証は `crypto.subtle.timingSafeEqual` で行います。
- セッション ID は `crypto.randomUUID()` で生成し、有効期限は 7 日です。期限切れのセッションはリクエスト時に削除します。
- Cookie は HttpOnly / SameSite=Lax / Path=/ 付きで、HTTPS でアクセスされたときのみ Secure を付与します。
- フォーム POST は `hono/csrf` で保護しています。`/api/` 配下は Origin を送らないクライアントからも使えるよう対象外にし、代わりに Bearer 認証のみで守ります。
- 全ルートに `hono/secure-headers` を適用しています。`Referrer-Policy` は既定の `no-referrer` ではなく `strict-origin-when-cross-origin` にしています。`no-referrer` だと同一オリジンのフォーム POST でも `Origin: null` が送られ、CSRF 保護に弾かれるためです。
- API キーの認証は Cookie を読まず、`Authorization` ヘッダだけを見ます。
- Todo のクエリはすべて `user_id` で絞り込むため、他ユーザーの Todo は操作できません。画像のルートも同様に所有者を確認し、他ユーザーの Todo には 404 を返します。

## デプロイ

```sh
pnpm wrangler login                                  # 初回のみ。ブラウザで Cloudflare にログイン
pnpm wrangler r2 bucket create cloudflare-todo-images # 初回のみ。画像用の R2 バケットを作成
pnpm wrangler d1 migrations apply DB --remote        # リモート D1 にマイグレーションを適用
pnpm run deploy                                      # Worker と public/ をデプロイ
```

D1 データベースは `wrangler d1 create cloudflare-todo` で作成済みで、その `database_id` を wrangler.jsonc に設定しています。
別アカウントで動かす場合は同コマンドで作り直し、`database_id` を差し替えてください。
