# cloudflare-todo

Cloudflare Workers + Hono + D1 + R2 で動く、メール + パスワード認証付きの Todo アプリです。
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
wrangler.jsonc          Workers の設定 (D1 バインディング DB, R2 バインディング IMAGES, nodejs_compat, 静的アセット)
public/                 静的アセット (style.css)。Workers Static Assets で配信
migrations/             D1 のマイグレーション (users / sessions / todos / todos.image_key)
src/
  index.tsx             ルーティング、認証ミドルウェア、CSRF、Cookie
  auth.ts               PBKDF2 (SHA-256) によるパスワードハッシュとセッション定数
  db.ts                 D1 へのクエリとレコード型
  storage.ts            R2 への画像の保存・取得・削除
  validation.ts         メール形式・パスワード長・タイトル長・画像形式とサイズのバリデーション
  views/                Layout / Login / Signup / TodoList の JSX コンポーネント
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

## 画像添付

- 1 つの Todo につき画像は 1 枚です。実体は R2 バケット `cloudflare-todo-images` (バインディング `IMAGES`) に置きます。
- オブジェクトキーは `${userId}/${todoId}/${uuid}` で、`todos.image_key` に保存します。差し替え時と Todo 削除時は古いオブジェクトを R2 から削除します。
- 受け付ける形式は JPEG / PNG / WebP / GIF、サイズは 5MB 以下です。違反した場合は一覧画面にエラーを表示します。
- 配信は `Content-Type` を R2 の `httpMetadata.contentType`、`Cache-Control` を `private, max-age=0` として返します。
- ローカル開発では R2 も Miniflare がエミュレートするため、リモートのバケットがなくても `wrangler dev` で動きます。

## 認証の仕組み

- パスワードは Web Crypto の PBKDF2 (SHA-256 / 100,000 回) でハッシュ化し、16 バイトのソルトと共に保存します。
- 検証は `crypto.subtle.timingSafeEqual` で行います。
- セッション ID は `crypto.randomUUID()` で生成し、有効期限は 7 日です。期限切れのセッションはリクエスト時に削除します。
- Cookie は HttpOnly / SameSite=Lax / Path=/ 付きで、HTTPS でアクセスされたときのみ Secure を付与します。
- フォーム POST は `hono/csrf` で保護しています。
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
