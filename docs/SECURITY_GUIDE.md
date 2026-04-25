# chiro-saas セキュリティガイド

> シニアセキュリティエンジニアの視点でまとめた、本プロジェクト固有の脅威モデルと防御策。
> **PR作成前に必ずこのチェックリストで自己監査を実施すること。**

---

## 1. マルチテナント隔離（tenantId 必須ルール）

### 脅威
マルチテナント SaaS における最大のリスクは **テナント越境アクセス（Cross-Tenant Data Leakage）**。
攻撃者が自テナントの患者IDを他テナントのリクエストに混入させ、他院の患者情報を読み取る攻撃。

### 必須ルール

```typescript
// ❌ 絶対禁止: tenantId なし
await prisma.patient.findFirst({ where: { id: patientId } });

// ✅ 必須: tenantId を先頭に配置（視認性のため）
await prisma.patient.findFirst({ where: { tenantId, id: patientId } });
```

### tenantId の信頼できる取得元

| 取得元 | 信頼性 | 用途 |
|--------|--------|------|
| `auth()` セッション → `session.user.tenantId` | ✅ 高 | 管理画面 Server Action |
| DB照合: `prisma.tenant.findUnique({ where: { subdomain: slug } })` | ✅ 高 | 公開フォーム・マイページ |
| URL パラメータ `[tenantId]` のみ（DB未照合） | ⚠️ 中 | 追加検証が必要 |
| `formData.get("tenantId")` / リクエストボディ | ❌ 低 | **使用禁止**（クライアント改ざん可能） |

### PR 前チェック
- [ ] 新規追加した全 Prisma クエリに `tenantId` フィルタがあるか
- [ ] `tenantId` をセッションまたは DB 照合から取得しているか
- [ ] FormData / リクエストボディの `tenantId` を直接 Prisma クエリに渡していないか

---

## 2. IDOR（Insecure Direct Object Reference）防止

### 脅威
認証はされているが、**操作対象のリソースが自分のものかチェックされていない**脆弱性。
例: 患者A がURLの予約IDを変えて患者Bの予約をキャンセルする。

### 必須パターン

```typescript
// ❌ IDOR 脆弱: ID だけで操作
await prisma.appointment.delete({ where: { id: appointmentId } });

// ✅ 安全: ID + tenantId + patientId で所有権を確認
const target = await prisma.appointment.findFirst({
  where: { id: appointmentId, tenantId, patientId },
});
if (!target) return { error: "not found" };
await prisma.appointment.delete({ where: { id: appointmentId } });
```

### マイページの追加要件
患者セッションが操作対象と一致することを確認する。

```typescript
// マイページ Server Action: セッション検証必須
const session = verifySessionToken(cookieValue);
if (!session || session.tenantId !== tenant.id) throw new Error("unauthorized");

// 操作対象が当該患者のものか確認
const appt = await prisma.appointment.findFirst({
  where: { id: apptId, tenantId: session.tenantId, patientId: session.patientId },
});
```

### PR 前チェック
- [ ] 新規 findFirst/findUnique に `tenantId` と `id` の両方があるか
- [ ] update/delete 前に対象リソースの所有権を確認しているか
- [ ] マイページ操作で `session.patientId` と照合しているか

---

## 3. 入力のサニタイズ（Zod によるスキーマバリデーション）

### 脅威
- **SQL インジェクション**: Prisma ORM が防御するが、動的クエリは要注意
- **XSS**: 未サニタイズの文字列をHTML出力
- **ビジネスロジック迂回**: 不正な型・範囲の値で予期しない動作を誘発

### 必須ルール

```typescript
import { z } from "zod";

// ❌ 危険: 生の FormData を直接使用
const phone = formData.get("phone") as string;

// ✅ 安全: Zod でスキーマ検証
const schema = z.object({
  phone:     z.string().regex(/^[\d\-\s]{10,13}$/),
  birthDate: z.string().regex(/^\d{8}$/),
  email:     z.string().email().optional(),
});
const parsed = schema.safeParse(Object.fromEntries(formData));
if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
```

> **現状**: 本プロジェクトは Zod を未導入のため、正規表現による手動バリデーションで代替している。
> 新規 Server Action を追加する際は Zod の導入を検討すること。
> 既存コードも段階的に Zod に移行することが推奨される。

### PR 前チェック
- [ ] 全ての外部入力（FormData, URL params, リクエストボディ）を検証しているか
- [ ] 数値型は `parseInt` / `Number` 後に `isNaN` チェックをしているか
- [ ] メールアドレス・電話番号・生年月日に正規表現バリデーションがあるか
- [ ] XSS のリスクがある文字列を `dangerouslySetInnerHTML` に渡していないか

---

## 4. シークレット情報の秘匿

### 脅威
- APIキー・DB接続文字列のソースコードへの混入
- エラーメッセージによる内部情報漏洩
- クライアントへのシークレット値送信

### 必須ルール

```typescript
// ❌ 禁止: ハードコード
const apiKey = "sk-proj-abc123...";

// ✅ 必須: 環境変数のみから取得
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) throw new Error("RESEND_API_KEY が未設定です");
```

#### クライアントへの漏洩防止
- `NEXT_PUBLIC_` プレフィックスなしの環境変数はサーバーサイド専用
- Server Component / Server Action でのみシークレットを扱う
- エラーレスポンスに詳細なスタックトレース・DB情報を含めない

#### ユーザー列挙攻撃の防止
```typescript
// ❌ 危険: 存在有無が分かる
if (!patient) return { error: "患者が見つかりません" };
if (patient.accessPin !== pin) return { error: "暗証番号が違います" };

// ✅ 安全: 同一メッセージで情報を漏らさない
if (!patient || patient.accessPin !== pin) {
  return { error: "生年月日または暗証番号が正しくありません" };
}
```

### PR 前チェック
- [ ] 新規の環境変数を `.env.example` に追記したか（値は空または説明文のみ）
- [ ] エラーメッセージがユーザー列挙・内部情報の漏洩につながらないか
- [ ] `NEXT_PUBLIC_` 変数にシークレット値が含まれていないか

---

## 5. レートリミット（ブルートフォース攻撃対策）

### 脅威
- **ブルートフォース攻撃**: 暗証番号（4桁=10,000通り）の総当たり
- **クレデンシャルスタッフィング**: 漏洩したパスワードリストを自動試行
- **予約スパム**: 大量の偽予約で院のカレンダーを埋め尽くす

### 本プロジェクトの実装

`@upstash/ratelimit` + Upstash Redis を使用。Next.js Middleware で以下を制限:

| エンドポイント | 制限 | ウィンドウ |
|-------------|------|---------|
| `/*/mypage/login` | 10リクエスト | 15分 |
| `/*/mypage/pin-reset` | 5リクエスト | 1時間 |
| `/*/reserve` | 5リクエスト | 1分 |

#### 設定ファイル
- `src/middleware.ts` — Rate limit ロジック
- `src/lib/rate-limit.ts` — Ratelimit インスタンスの定義

#### 必要環境変数
```
UPSTASH_REDIS_REST_URL=https://******.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX****
```
> 未設定の場合はレートリミットをスキップし（開発環境向け）、ログに警告を出力する。

### PR 前チェック
- [ ] 新規の認証エンドポイントにレートリミットが適用されているか
- [ ] ブルートフォースの対象になりうる入力フォームはどれか確認したか
- [ ] Upstash の環境変数が `.env.example` に記載されているか

---

## PR 作成前 セキュリティ自己監査チェックリスト（まとめ）

以下を全て確認してから PR を作成すること。

### テナント隔離
- [ ] 新規 Prisma クエリすべてに `tenantId` フィルタがある
- [ ] `tenantId` はセッションまたは DB 照合由来のみ

### IDOR 防止
- [ ] リソース操作前に `tenantId` + `id` で所有権確認をしている
- [ ] マイページ操作は `session.patientId` と照合している

### 入力検証
- [ ] 全外部入力に型・形式バリデーションがある
- [ ] エラー分岐が情報漏洩していない

### シークレット管理
- [ ] ハードコードされたシークレットがない
- [ ] `NEXT_PUBLIC_` にシークレットが混入していない

### レートリミット
- [ ] 認証系エンドポイントに制限がかかっている
- [ ] 新規フォームの悪用可能性を検討した

---

*最終更新: 2026-04-26 | 担当: chiro-saas セキュリティチーム*
