# Movie Room

視聴者のおすすめ映画を集めて投票順に並べるWebアプリ。Next.js / Vercel / Supabase。

## v1

- ログインなしの映画投稿・投票・取り消し
- 映画名検索、得票順・新着順、視聴状態の絞り込み、30件ごとのページ送り
- 公開年を含む重複判定、投稿前の候補表示
- 配信者ログイン、次に観る／視聴済み、情報編集、削除と直後の復元
- 投稿と最初の票をトランザクションで保存、得票数は保存票から集計
- 署名付きHttpOnly Cookieでブラウザを識別、1作品1ブラウザ1票
- Supabaseに保存する連投制限。公開APIからDBテーブルへ直接アクセス不可

## セットアップ

Node.js 24を使用します。

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local` にSupabase Project URL、Publishable key、Secret key、管理者メールアドレスを設定します。秘密情報をGitへコミットしないでください。`SUPABASE_URL` は不要で、`NEXT_PUBLIC_SUPABASE_URL` をサーバーでも使用します。

Supabase SQL Editorで `supabase/migrations/001_initial.sql`、`002_v1.sql` の順に実行してください。001が実行済みなら002だけを実行します。各マイグレーションは一度だけ実行します。

Supabase Authenticationでメール確認済みの配信者ユーザーを作成し、同じメールアドレスをVercelの `ADMIN_EMAIL` に設定してください。公開サインアップ画面は提供しません。管理者かどうかはサーバーで検証し、通常のログインユーザーに管理権限を与えません。

## Vercel

GitHubリポジトリをImportし、Next.js、Root Directory `./`、Node.js 24.xを使用します。SupabaseがSydneyにあるためFunctionsの地域も `syd1` にしています。

環境変数は `.env.example` の4つを登録します。Secret keyと管理者メールはSecret型、公開URLとPublishable keyはConfig型で設定できます。環境変数の変更は次回デプロイで反映されます。

Previewも本番と同じDBに接続するとデータを共有します。検証データを分ける場合は別Supabaseプロジェクトの接続情報をPreviewへ登録してください。

## チェック

```sh
npm run lint
npm test
npm run build
```

DBテストはPGlite（PostgreSQL）上でスキーマ・集計・二重投票・権限・連投制限を検証します。pgcryptoの拡張インストール行のみ省略し、PostgreSQL標準のUUID関数を使います。Supabase Authとの本番接続は別途実際のログインで確認してください。

## 運用

- 視聴者の投稿: 1ブラウザ10件/時、同一接続元50件/時。
- 投票操作: 1ブラウザ40回/分、同一接続元200回/分。
- 管理ログイン: 同一接続元15回/15分。Supabase側の制限も適用されます。
- 管理セッション: アクセストークンの期限を確認し、再訪・管理操作時に更新。更新用Cookieは最大7日。
- 削除は `deleted_at` による非表示です。直後の「元に戻す」、またはSQL Editorで対象行の `deleted_at` をNULLに戻して復元できます。同名・同年の有効な映画が存在すると復元は拒否されます。
- Supabase Secret keyを変更すると、署名付き投票Cookieの署名鍵も変わります。既存の投票数は残りますが利用者の識別は新しくなるため、キー変更時には運用上の周知を行ってください。
- データ保存先はSupabaseです。定期的なDBバックアップと復元確認を行ってください。
- Cookie削除・別ブラウザ・別端末の重複投票までは防げません。邦題と原題などの別名は自動統合しません。
- 環境変数が未設定の場合、秘密情報を出さず公開準備中の案内を表示します。

## 構成

`src/components/movie-room.tsx`: 画面。`src/app/api`: サーバーAPI。`src/lib`: 入力・認証・Cookie・接続処理。`supabase/migrations`: DB変更履歴。
