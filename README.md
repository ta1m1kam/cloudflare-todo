# cloudflare-todo

Cloudflare Workers + Hono + D1 で動く、メール + パスワード認証付きの Todo アプリです。
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
wrangler.jsonc          Workers の設定 (D1 バインディング DB, nodejs_compat, 静的アセット)
public/                 静的アセット (style.css)。Workers Static Assets で配信
migrations/             D1 のマイグレーション (users / sessions / todos)
src/
  index.tsx             ルーティング、認証ミドルウェア、CSRF、Cookie
  auth.ts               PBKDF2 (SHA-256) によるパスワードハッシュとセッション定数
  db.ts                 D1 へのクエリとレコード型
  validation.ts         メール形式・パスワード長・タイトル長のバリデーション
  views/                Layout / Login / Signup / TodoList の JSX コンポーネント
```

## ルート

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET / POST | `/signup` | 新規登録 |
| GET / POST | `/login` | ログイン |
| POST | `/logout` | ログアウト |
| GET | `/` | Todo 一覧 (未ログインなら `/login` へリダイレクト) |
| POST | `/todos` | Todo 追加 |
| POST | `/todos/:id/toggle` | 完了状態の切り替え |
| POST | `/todos/:id/delete` | 削除 |

## 認証の仕組み

- パスワードは Web Crypto の PBKDF2 (SHA-256 / 100,000 回) でハッシュ化し、16 バイトのソルトと共に保存します。
- 検証は `crypto.subtle.timingSafeEqual` で行います。
- セッション ID は `crypto.randomUUID()` で生成し、有効期限は 7 日です。期限切れのセッションはリクエスト時に削除します。
- Cookie は HttpOnly / SameSite=Lax / Path=/ 付きで、HTTPS でアクセスされたときのみ Secure を付与します。
- フォーム POST は `hono/csrf` で保護しています。
- Todo のクエリはすべて `user_id` で絞り込むため、他ユーザーの Todo は操作できません。
