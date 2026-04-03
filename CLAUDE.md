# CLAUDE.md — chiro-saas 設計指針（完全版）

> このファイルは chiro-saas の**絶対的な指針**である。実装上の判断が迷ったとき、常にここに立ち返ること。

---

## プロジェクト概要

整骨院向けマルチテナント型予約・顧客管理SaaS（chiro-saas）。
A院（高機能）とB院（シンプル）の機能差分を**フィーチャートグル**で管理し、単一コードベースで複数の運用スタイルを支える。

- **A院**: スタッフ別枠管理、詳細カルテ（部位・写真・動画）、トレーニング記録、多種決済
- **B院**: 院長1名の枠管理、簡易カルテ、Square連携のみ

**設計の3原則**
1. **マルチテナント** — 全テーブルに `tenant_id` を持ち、テナント間データを完全論理分離する
2. **フィーチャートグル** — テナント設定で機能ON/OFFを切り替え、単一コードベースを維持する
3. **承認フロー必須** — 全予約は `pending → confirmed` の承認ステップを経る（不変）

---

## 技術スタック

| 項目 | 採用技術 |
|---|---|
| Framework | Next.js（App Router） |
| Database / Auth | Supabase（Auth は Email/Password 方式） |
| ORM | Prisma |
| Styling | Tailwind CSS + shadcn/ui |
| アイコン | Lucide React |
| ホスティング | Vercel + Supabase |

---

## 開発コマンド

```bash
pnpm dev                  # 開発サーバー起動
pnpm build                # プロダクションビルド

npx prisma generate       # Prisma クライアント生成（スキーマ変更後に必ず実行）
npx prisma db push        # スキーマを DB に同期（マイグレーションなし）
npx prisma studio         # DB 閲覧 GUI の起動
```

---

## ディレクトリ構成の指針

```
src/
  app/
    [tenant_id]/              # テナントごとのルーティングベース
      (admin)/                # 管理者向けページ群
      (patient)/              # 患者向けページ群
  components/                 # UIコンポーネント（ビジネスロジックを含まない純粋なUI）
  features/                   # 機能ドメインごとのビジネスロジック
    appointments/
    karte/
    tenants/
    ...
  lib/
    supabase/                 # Supabase クライアント・サーバー初期化
    prisma/                   # Prisma クライアント
    features/                 # TenantFeatureService など
  middleware.ts               # テナント認証・tenant_id 照合（必須）
  types/                      # 型定義
```

**原則**: ビジネスロジックは `features/` に置き、`components/` には UI のみ。

---

## 超一流デザイナーとしての UI/UX 規約

### 役割と姿勢

UIを実装するとき、あなたは**世界レベルのプロダクトデザイナー**として振る舞うこと。
「なんとなく動く画面」ではなく、「使うたびに信頼が積み重なるプロダクト」を作ることを常に意識する。

### デザインコンセプト

**「信頼」「清潔」「静謐」**

医療・ウェルネス領域に相応しい、余白を活かしたモダンミニマルデザインを徹底する。
過剰な装飾・派手なアニメーション・情報の詰め込みは禁止。すべての要素が「理由」を持つこと。

### カラーパレット

shadcn/ui のデフォルト配色をそのまま使わず、以下の方針で独自パレットを適用すること。

| 用途 | 方針 |
|---|---|
| プライマリ | ソフトブルー系（例: `#3B82F6` ベースに彩度を落とした落ち着きのある青） |
| アクセント | ミントグリーン系（例: `#10B981` 系。過度に使わず、CTAや確定状態に限定） |
| 背景 | オフホワイト（`#F9FAFB` など）。純白は避け、目に優しい柔らかさを持たせる |
| テキスト | `#111827`（本文）/ `#6B7280`（補助テキスト）。コントラスト比 WCAG AA 以上を維持 |
| ボーダー | `#E5E7EB` 程度の淡いグレー。主張しすぎない |
| エラー | `#EF4444` 系。ただし背景・ボーダーで柔らかく表現し、恐怖感を与えない |

### スペーシング・タイポグラフィ

- 余白は **大胆に取る**。要素を詰めるよりも、呼吸できる空間を優先する。
- フォントサイズの階層は明確に（見出し / サブ見出し / 本文 / 補助テキスト の4段階を維持）。
- `border-radius`: カード・ボタンは `rounded-xl`（12px）以上を基本とし、角ばった印象を避ける。

### アイコン

- **Lucide React** を使用すること（他のアイコンライブラリは混在させない）。
- 線が細く洗練されたアイコンを選定し、サイズは `size={16}` または `size={20}` を基本とする。
- テキストラベルがない単独アイコンには必ず `aria-label` を付与する。

### UX 原則

- **モバイルファースト**: 全UIをスマートフォン縦持ちで設計し、デスクトップはその拡張として扱う。
- **Fitts の法則**: タップ・クリックターゲットは最低 44×44px を確保する。最小限のタップで目的達成できる情報設計を意識する。
- **ローディング状態**: データ取得中は必ずスケルトンUIまたはスピナーを表示する。空白放置は禁止。
- **空状態（Empty State）**: データが0件のときも、次のアクションを促すメッセージとCTAを表示する。
- **エラーフィードバック**: フォームバリデーションエラーは該当フィールド直下にインラインで表示する。

---

## マルチテナント運用のガードレール（絶対ルール）

### Middleware による tenant_id 照合

`src/middleware.ts` で、`[tenant_id]` パスパラメータとセッションの `tenant_id` を**必ず照合**すること。
このチェックなしに内部ページへのアクセスを許可してはならない。

```typescript
// src/middleware.ts（必須実装パターン）
export async function middleware(request: NextRequest) {
  const { tenant_id } = request.nextUrl.pathname.match(...)?.groups ?? {};
  const session = await getSupabaseSession(request);

  // セッションの tenant_id とパスの tenant_id が一致しない場合は即時 403
  if (!session || session.user.tenant_id !== tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
}
```

### Prisma 操作の絶対ルール

**全ての Prisma クエリの `where` 句に `tenant_id` を含めること。**
フィルタリング漏れは**重大なセキュリティインシデント**として扱い、レビューで即リジェクトする。

```typescript
// 絶対禁止: tenant_id なしのクエリ
await prisma.appointment.findMany({ where: { patient_id: userId } });

// 必須: tenant_id を常に先頭に置く（視認性のため）
await prisma.appointment.findMany({
  where: {
    tenant_id,      // ← 常に先頭
    patient_id: userId,
  },
});
```

- `tenant_id` は必ずセッション由来の値を使用する。リクエストボディ・クエリパラメータからの値は使用しない。
- クエリヘルパー関数を作る場合は `tenantId` を必須引数として強制すること。

### 認証

- Supabase Auth のセッション管理を利用すること。独自JWT実装は禁止。
- アクセストークン有効期限: 15分 / リフレッシュトークン有効期限: 30日。
- Server Component では `createServerComponentClient`、Route Handler では `createRouteHandlerClient` を使用する。

### フィーチャートグルの2層バリデーション

フロントエンド（表示制御）とバックエンド（APIアクセス制御）の**両方**でトグル値を検証すること。
フロントのみの制御は禁止。

```typescript
// NG: フロントエンドの表示制御だけに依存
if (features.training_record) return <TrainingSection />;

// OK: APIミドルウェアでもガードする
async function trainingGuard(tenantId: string) {
  const enabled = await featureService.isEnabled(tenantId, 'training_record');
  if (!enabled) throw new ForbiddenError('Feature not enabled');
}
```

- `TenantFeatureService` を介してトグル値を取得する。直接 DB クエリを書かない。
- `require_approval` トグルは全テナント必須。OFF にするコードを書いてはならない。

### 予約承認フロー

- 予約ステータスは必ず `pending → confirmed` の順を経ること。
- ステータス変更は必ず `appointment_logs` に記録する。
- ステータスの巻き戻し（`confirmed → pending`）は禁止。

---

## 確定済みの技術標準仕様

requirements.md §7 の未決事項のうち、以下は確定済みとして実装すること。

### ストレージ

- **Supabase Storage** を使用する。
- バケットには Row Level Security (RLS) を適用し、直接公開 URL は発行しない。
- ファイルアクセスは**署名付きURL（Signed URL）のみ**許可する。

```typescript
// 必須パターン
const { data } = await supabase.storage
  .from('karte-media')
  .createSignedUrl(filePath, 60); // 有効期限 60秒
return { url: data?.signedUrl };
```

- ファイルアップロード時のバリデーション: **1ファイル最大 50MB**。これを超える場合はクライアント側でエラーを返す。

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
if (file.size > MAX_FILE_SIZE) {
  throw new Error('ファイルサイズは50MB以下にしてください');
}
```

### マスタデータ

- トレーニング種目・部位・施術内容マスタは**一般的なプリセットデータを初期投入**する。
- 管理画面から `tenant_admin` が CRUD 操作できる UI を提供する。

### LINE 通知・リマインダー

- **LINE Messaging API** を使用する。
- リマインダーの送信タイミングのデフォルト値: **予約の24時間前** と **2時間前**。
- テナントごとにタイミングをカスタマイズ可能な設計とする（`notification_templates` テーブルで管理）。

---

## ロール定義

| ロール | 権限範囲 |
|---|---|
| `super_admin` | 全テナント管理（SaaS運営者） |
| `tenant_admin` | 自テナントのみ：設定・スタッフ管理・フィーチャートグル変更 |
| `staff` | 自テナントのみ：予約確認・承認・カルテ入力 |
| `patient` | 自テナントのみ：予約申込・自分のカルテ閲覧 |

---

## フィーチャートグル一覧

| トグルキー | デフォルト | A院 | B院 | 説明 |
|---|---|---|---|---|
| `karte_mode` | `simple` | `professional` | `simple` | カルテ詳細度 |
| `training_record` | `false` | `true` | `false` | トレーニング記録 |
| `staff_assignment` | `false` | `true` | `false` | スタッフ指名 |
| `multi_staff` | `false` | `true` | `false` | 複数スタッフ枠管理 |
| `appointment_buffer` | `0` | `10` | `30` | 予約後余白（分） |
| `insurance_billing` | `false` | `true` | `false` | 保険請求 |
| `ticket_pass` | `false` | `true` | `false` | 回数券 |
| `cancellation_hours` | `24` | `12` | `24` | キャンセル可能期限（時間前） |
| `require_approval` | `true` | `true` | `true` | 承認フロー（**OFF不可・絶対**） |
| `line_notify` | `true` | `true` | `true` | LINE通知 |

---

## データ保持ポリシー

| データ種別 | 保持期間 | 削除方式 |
|---|---|---|
| カルテ・施術記録 | **5年間**（法定） | 論理削除後、物理削除スケジューラ |
| 予約データ | 5年間 | 同上 |
| 通知ログ | 1年間 | 自動パージ |
| メディアファイル | 5年間 | ストレージライフサイクルポリシー |

---

## 非機能要件（目標値）

| 指標 | 目標 |
|---|---|
| APIレスポンス（p95） | < 500ms |
| カレンダー週ビュー（p95） | < 1s |
| 稼働率 | 99.5%（MVP期）→ 99.9%（拡大後） |
| 同時接続 | 500セッション（50テナント × 10セッション） |
| 通信 | HTTPS 必須（TLS 1.2 以上） |

---

## MVP フェーズ（Phase 1）対象機能

テナント管理、スタッフ管理、患者管理、施術メニュー、タイムスロット設定、予約申込（管理画面/Webフォーム）、予約承認・キャンセルフロー、カレンダービュー（日・週表示）、カルテ入力（simple/professional）、LINE・メール通知、フィーチャートグル管理画面。

詳細は `requirements.md` §5 を参照。
