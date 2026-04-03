# 要件定義書：整骨院向け予約・顧客管理SaaS

**バージョン:** 0.1.0
**作成日:** 2026-04-01
**ステータス:** ドラフト（クライアント合意前）

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [ステークホルダーとユースケース](#2-ステークホルダーとユースケース)
3. [フィーチャートグル設計（実装案）](#3-フィーチャートグル設計実装案)
4. [マルチテナント DB 設計（ER図案）](#4-マルチテナント-db-設計er図案)
5. [MVP 機能リスト](#5-mvp-機能リスト)
6. [非機能要件](#6-非機能要件)
7. [未決事項・打ち合わせアジェンダ](#7-未決事項打ち合わせアジェンダ)

---

## 1. プロジェクト概要

### 1.1 目的

整骨院における LINE・電話・口頭による分散した予約受付を一元化し、受付業務コストを削減する。
単院向けの提供に留まらず、**将来的な SaaS（他社販売・多店舗展開）**を見据えたマルチテナント設計を採用する。

### 1.2 想定クライアント（初期）

| クライアント | 特性 | 代表的な差分要件 |
|---|---|---|
| **A院** | 高機能・詳細運用 | スタッフ別枠管理、詳細カルテ（部位・写真・動画）、トレーニング記録、多種決済 |
| **B院** | シンプル運用 | 院長1名の枠管理、簡易カルテ、Square連携のみ |

### 1.3 設計の3原則

1. **マルチテナント:** 全テーブルに `tenant_id` を持ち、テナント間データを完全論理分離する。
2. **フィーチャートグル:** テナント設定によって機能の有効/無効を切り替え、単一コードベースで複数の運用スタイルを支える。
3. **承認フロー必須:** 全予約は `pending（仮受付）→ confirmed（確定）` の承認ステップを経る。

---

## 2. ステークホルダーとユースケース

### 2.1 ロール定義

| ロール | 説明 | 対象テナント |
|---|---|---|
| `super_admin` | SaaS 運営者。全テナント管理。 | システム全体 |
| `tenant_admin` | 院長相当。テナント設定・スタッフ管理が可能。 | 自テナントのみ |
| `staff` | スタッフ。予約確認・承認・カルテ入力が可能。 | 自テナントのみ |
| `patient` | 患者（エンドユーザー）。予約・カルテ閲覧が可能。 | 自テナントのみ |

### 2.2 主要ユースケース

#### UC-01: 患者が予約を申し込む
```
患者 → 予約フォーム（埋め込みカレンダー or LINE） → status: pending
     → 院長/スタッフが承認 → status: confirmed
     → 通知（LINE / メール）が患者に送信される
```

#### UC-02: スタッフがカルテを入力する
```
施術完了後 → カルテ入力画面を開く
           → [A院] 部位チェック / 写真アップロード / トレーニング記録
           → [B院] 症状テキスト / 経過メモ
           → 保存（5年間保持）
```

#### UC-03: 院長がテナント設定を変更する
```
管理画面 → テナント設定ページ
         → フィーチャートグルのON/OFF切替
         → キャンセル規定・予約インターバルの変更
         → 保存 → 即時反映
```

---

## 3. フィーチャートグル設計（実装案）

### 3.1 設計方針

テナントごとの機能差異を **`tenant_features` テーブル（DB）と `TenantFeatureService`（アプリ層）** の2層で管理する。
フロントエンド・バックエンドの両方でトグル値を参照し、UIの表示制御とAPIのアクセス制御を行う。

```
┌─────────────────────────────────────────┐
│              クライアント（ブラウザ）         │
│  TenantContext（トグル値をReact Context等で保持）│
│  → コンポーネントが isEnabled('feature_x') を参照│
└──────────────────┬──────────────────────┘
                   │ API リクエスト（tenant_id 付き）
┌──────────────────▼──────────────────────┐
│              バックエンド                    │
│  TenantFeatureGuard（ミドルウェア）          │
│  → DBからトグル値を取得してAPIアクセスを制御  │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│         tenant_features テーブル（PostgreSQL）  │
└─────────────────────────────────────────┘
```

### 3.2 フィーチャートグル一覧

| トグルキー | デフォルト | A院 | B院 | 説明 |
|---|---|---|---|---|
| `karte_mode` | `simple` | `professional` | `simple` | カルテの詳細度。`simple`=症状テキスト、`professional`=部位・写真・動画 |
| `training_record` | `false` | `true` | `false` | トレーニング記録機能の有効化 |
| `staff_assignment` | `false` | `true` | `false` | 予約時のスタッフ指名機能 |
| `multi_staff` | `false` | `true` | `false` | 複数スタッフの枠管理 |
| `appointment_buffer` | `0` | `10` | `30` | 予約後の自動余白時間（分）。B院は固定30分 |
| `insurance_billing` | `false` | `true` | `false` | 保険請求機能 |
| `ticket_pass` | `false` | `true` | `false` | 回数券機能 |
| `cancellation_hours` | `24` | `12` | `24` | キャンセル可能期限（予約の何時間前まで） |
| `require_approval` | `true` | `true` | `true` | 承認フロー（全テナント必須、OFF不可） |
| `line_notify` | `true` | `true` | `true` | LINE通知 |

### 3.3 DB テーブル定義

```sql
-- テナント機能設定テーブル
CREATE TABLE tenant_features (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key   VARCHAR(64) NOT NULL,   -- 上表のトグルキー
  feature_value TEXT NOT NULL,           -- 'true' / 'false' / 数値 / enum文字列
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, feature_key)
);
```

### 3.4 アプリ層での参照例（TypeScript / 擬似コード）

```typescript
// サービス層
class TenantFeatureService {
  async isEnabled(tenantId: string, key: string): Promise<boolean> {
    const feature = await db.tenant_features.findOne({ tenantId, key });
    return feature?.value === 'true';
  }

  async getValue(tenantId: string, key: string): Promise<string> {
    const feature = await db.tenant_features.findOne({ tenantId, key });
    return feature?.value ?? FEATURE_DEFAULTS[key];
  }
}

// API ミドルウェア（例：トレーニング記録エンドポイント保護）
async function trainingGuard(req, res, next) {
  const enabled = await featureService.isEnabled(req.tenantId, 'training_record');
  if (!enabled) return res.status(403).json({ error: 'Feature not enabled' });
  next();
}

// フロントエンド（React コンポーネント）
function KarteForm({ tenantFeatures }) {
  const isProfessional = tenantFeatures.karte_mode === 'professional';
  return (
    <>
      <BasicSymptomInput />
      {isProfessional && <BodyPartSelector />}
      {isProfessional && <MediaUploader />}
      {tenantFeatures.training_record && <TrainingRecordSection />}
    </>
  );
}
```

### 3.5 カルテモード詳細：`simple` vs `professional`

| 項目 | simple（B院） | professional（A院） |
|---|---|---|
| 症状テキスト | ✅ | ✅ |
| 経過メモ | ✅ | ✅ |
| 部位選択（頭・首・腰等） | ❌ | ✅ チェックボックス |
| 施術内容（アクチベーター・指圧等） | ❌ | ✅ チェックボックス |
| 状態評価（良好・痛い等） | ❌ | ✅ |
| 写真アップロード | ❌ | ✅ |
| 動画アップロード | ❌ | ✅ |
| トレーニング記録 | ❌ | ✅（別トグル） |

---

## 4. マルチテナント DB 設計（ER図案）

### 4.1 設計方針

- **論理分離（Shared Database, Shared Schema）** を採用。物理分離より実装コストが低く、スタートアップ規模に適切。
- 全テーブルに `tenant_id UUID NOT NULL` を付与し、外部キーと複合インデックスで分離を保証。
- RLSはPostgreSQL Row Level Security（将来オプション）で強化可能。

### 4.2 テーブル一覧

```
tenants                  テナント（整骨院）
tenant_features          フィーチャートグル設定
users                    ユーザー（staff / patient 共通）
staff_profiles           スタッフ固有情報（資格・担当可能メニュー）
patients                 患者固有情報（生年月日・緊急連絡先等）
menus                    施術メニューマスタ
staff_menu_assignments   スタッフ × メニュー 対応表
time_slots               予約可能枠マスタ（スタッフ別または院共通）
appointments             予約
appointment_logs         予約ステータス変更履歴
karte_records            カルテ（施術記録）
karte_body_parts         カルテ × 部位（professional モードのみ）
karte_treatments         カルテ × 施術内容（professional モードのみ）
karte_media              カルテ添付ファイル（写真・動画）
training_masters         トレーニング種目マスタ
training_records         トレーニング実施記録
payment_records          支払い記録
ticket_passes            回数券
ticket_usages            回数券利用履歴
notification_templates   通知テンプレート（メール・LINE）
notification_logs        送信済み通知ログ
cancellation_policies    キャンセルポリシー設定
```

### 4.3 ER図（主要テーブル）

```
┌──────────────────────────────────────────────────────────────────┐
│                        tenants                                    │
│  id(PK) | name | logo_url | color_theme | domain | plan | ...    │
└──────────────┬───────────────────────────────────────────────────┘
               │ tenant_id（全テーブルに付与）
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────────────┐
│    users    │  │    tenant_features       │
│  id         │  │  tenant_id               │
│  tenant_id  │  │  feature_key             │
│  email      │  │  feature_value           │
│  role       │  └──────────────────────────┘
│  line_uid   │
└──────┬──────┘
       │
  ┌────┴─────────────────────────┐
  │                              │
┌─▼───────────────┐    ┌────────▼────────────┐
│  staff_profiles  │    │      patients        │
│  user_id(FK)    │    │  user_id(FK)         │
│  tenant_id      │    │  tenant_id           │
│  specialties    │    │  birth_date          │
│  bio            │    │  emergency_contact   │
└──────┬──────────┘    └──────────────────────┘
       │
       │ ← staff_menu_assignments ─→ menus
       │
┌──────▼──────────────────────────────────────┐
│                 appointments                 │
│  id            tenant_id                    │
│  patient_id    staff_id (nullable)          │
│  menu_id       time_slot_id                 │
│  status        [pending|confirmed|cancelled] │
│  note          reserved_at                  │
│  confirmed_at  cancelled_at                 │
└──────┬──────────────────────────────────────┘
       │                    │
┌──────▼────────┐    ┌──────▼──────────────┐
│appointment_   │    │   karte_records      │
│    logs       │    │  id   tenant_id      │
│  appointment  │    │  appointment_id(FK)  │
│  _id(FK)      │    │  patient_id(FK)      │
│  old_status   │    │  staff_id(FK)        │
│  new_status   │    │  condition_note      │
│  changed_by   │    │  progress_note       │
│  changed_at   │    │  karte_mode_snapshot │
└───────────────┘    └──────┬───────────────┘
                            │
                  ┌─────────┼──────────────┐
                  │         │              │
          ┌───────▼──┐ ┌────▼──────┐ ┌────▼──────────┐
          │karte_body│ │karte_     │ │karte_media    │
          │_parts    │ │treatments │ │  file_url      │
          │(pro only)│ │(pro only) │ │  media_type    │
          └──────────┘ └───────────┘ └───────────────┘

┌────────────────────────────────────────────────────┐
│               training_records                      │
│  id | tenant_id | karte_id(FK) | master_id(FK)     │
│  sets | reps | weight | duration | memo             │
└────────────────────────────────────────────────────┘
┌─────────────────────────────┐
│      training_masters        │
│  id | tenant_id | name | category | is_active      │
└─────────────────────────────┘

┌────────────────────────────────────────────────────┐
│               payment_records                       │
│  id | tenant_id | appointment_id | patient_id      │
│  amount | payment_method | insurance_flg | memo    │
└────────────────────────────────────────────────────┘

┌──────────────────┐    ┌──────────────────────┐
│  ticket_passes   │    │   ticket_usages       │
│  id tenant_id    │    │  pass_id(FK)          │
│  patient_id      │─→  │  appointment_id(FK)   │
│  menu_id         │    │  used_at              │
│  total_count     │    └──────────────────────┘
│  used_count      │
│  expires_at      │
└──────────────────┘
```

### 4.4 主要テーブル DDL（抜粋）

```sql
-- テナント
CREATE TABLE tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  subdomain    VARCHAR(64)  UNIQUE,
  logo_url     TEXT,
  color_theme  JSONB,          -- {"primary": "#3B82F6", "accent": "#10B981"}
  plan         VARCHAR(32) NOT NULL DEFAULT 'standard',  -- 'standard' | 'pro'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ユーザー（スタッフ・患者共通）
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  email        VARCHAR(255),
  phone        VARCHAR(20),
  line_uid     VARCHAR(64),           -- LINE ユーザーID
  role         VARCHAR(32) NOT NULL,  -- 'tenant_admin' | 'staff' | 'patient'
  display_name VARCHAR(255) NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- 予約
CREATE TABLE appointments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  patient_id     UUID NOT NULL REFERENCES users(id),
  staff_id       UUID REFERENCES users(id),   -- NULL = スタッフ指名なし
  menu_id        UUID NOT NULL REFERENCES menus(id),
  time_slot_id   UUID REFERENCES time_slots(id),
  status         VARCHAR(32) NOT NULL DEFAULT 'pending',
                 -- 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'completed'
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ NOT NULL,
  note           TEXT,
  confirmed_at   TIMESTAMPTZ,
  confirmed_by   UUID REFERENCES users(id),
  cancelled_at   TIMESTAMPTZ,
  cancelled_by   UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('pending','confirmed','cancelled','no_show','completed'))
);
CREATE INDEX idx_appointments_tenant_date ON appointments(tenant_id, start_at);
CREATE INDEX idx_appointments_patient     ON appointments(tenant_id, patient_id);
CREATE INDEX idx_appointments_staff       ON appointments(tenant_id, staff_id);

-- カルテ
CREATE TABLE karte_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  appointment_id      UUID REFERENCES appointments(id),
  patient_id          UUID NOT NULL REFERENCES users(id),
  staff_id            UUID REFERENCES users(id),
  karte_mode_snapshot VARCHAR(32) NOT NULL, -- 記録時点のモード（変更後も参照可能）
  condition_note      TEXT,       -- simple/pro 共通: 症状メモ
  progress_note       TEXT,       -- simple/pro 共通: 経過メモ
  condition_status    VARCHAR(32),-- pro: 'good' | 'fair' | 'pain' | 'severe'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_karte_patient ON karte_records(tenant_id, patient_id);

-- カルテ添付（写真・動画）※ professional モードのみ利用
CREATE TABLE karte_media (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  karte_id       UUID NOT NULL REFERENCES karte_records(id) ON DELETE CASCADE,
  file_url       TEXT NOT NULL,   -- ストレージURL（S3等）
  media_type     VARCHAR(16) NOT NULL,  -- 'image' | 'video'
  file_size_kb   INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.5 データ保持・削除ポリシー

| データ種別 | 保持期間 | 削除方式 |
|---|---|---|
| カルテ・施術記録 | **5年間**（法定） | 論理削除後、物理削除スケジューラ |
| 予約データ | 5年間 | 同上 |
| 通知ログ | 1年間 | 自動パージ |
| メディアファイル | 5年間 | ストレージライフサイクルポリシー |

---

## 5. MVP 機能リスト

### 5.1 MVP の定義方針

「A院・B院の両方が最低限の業務を回せる状態」を MVP とする。
フィーチャートグルの仕組みは MVP から組み込み、後工程の機能追加コストを最小化する。

### 5.2 MVP 機能リスト（クライアント合意用）

#### Phase 1 MVP ― 必須（リリース前に完成）

| # | 機能 | 対象 | 備考 |
|---|---|---|---|
| M-01 | テナント作成・基本設定 | 全院 | 名前・ロゴ・カラー設定 |
| M-02 | スタッフアカウント管理 | 全院 | 招待メール、ロール設定（admin/staff） |
| M-03 | 患者登録・基本情報管理 | 全院 | 氏名・電話・生年月日・LINE連携 |
| M-04 | 施術メニューマスタ | 全院 | 名称・所要時間・価格 |
| M-05 | 予約枠（タイムスロット）設定 | 全院 | 曜日・時間帯・スタッフ別 |
| M-06 | 予約申込（管理画面から手動入力） | 全院 | 電話受付の代替として |
| M-07 | 予約申込（Webフォーム・カレンダーUI） | 全院 | 埋め込み用 iframe 対応 |
| M-08 | 予約承認フロー（pending → confirmed） | 全院 | 承認時に通知送信 |
| M-09 | 予約キャンセル（患者・スタッフ双方） | 全院 | キャンセル期限チェック付き |
| M-10 | カレンダービュー（日・週表示） | 全院 | 管理者向け予約一覧 |
| M-11 | カルテ入力（simple モード） | 全院 | 症状・経過テキスト |
| M-12 | カルテ入力（professional モード） | A院 | 部位・施術内容・状態評価 |
| M-13 | LINE通知（予約受付・確定・リマインダー） | 全院 | Messaging API 利用 |
| M-14 | メール通知 | 全院 | 予約確定・キャンセル |
| M-15 | フィーチャートグル管理画面 | 全院 | 管理者がON/OFF設定可能 |
| M-16 | 予約インターバル（バッファ）設定 | 全院 | 分単位で設定可能 |

#### Phase 2 ― 優先度高（MVP後、早期リリース）

| # | 機能 | 対象 | 備考 |
|---|---|---|---|
| P2-01 | 写真・動画アップロード（カルテ） | A院 | ストレージ容量制限設定 |
| P2-02 | トレーニング種目マスタ・記録 | A院 | 種目CRUD、記録入力 |
| P2-03 | 支払い記録（自費・保険区別） | 全院 | 簡易台帳 |
| P2-04 | Square連携 | B院 | 決済記録の自動取込 |
| P2-05 | 回数券管理 | A院 | 発行・利用消化・残数管理 |
| P2-06 | LINE予約フロー（LINE内完結） | 全院 | リッチメニュー連携 |
| P2-07 | 通知テンプレート編集 | 全院 | テナント別文面カスタマイズ |
| P2-08 | 患者側マイページ（Web） | 全院 | 予約確認・キャンセル |

#### Phase 3 ― 将来対応

| # | 機能 |
|---|---|
| P3-01 | スタッフ権限の細分化（RBAC） |
| P3-02 | 保険請求サポート（レセプト連携検討） |
| P3-03 | モバイルアプリ（患者向け） |
| P3-04 | デジタル診察券（QRコード） |
| P3-05 | 分析・レポート機能（予約数・売上推移） |
| P3-06 | SaaS向けプラン管理・請求（Stripe連携） |

### 5.3 MVP 合意チェックリスト（打ち合わせ用）

以下をクライアントと確認・合意すること。

**予約フロー**
- [ ] 予約の「仮押さえ」方式：pending 中に同一枠への別予約を許容するか？（競合許容 vs 排他ロック）
- [ ] 承認の担当者：院長のみか、スタッフも承認できるか？
- [ ] キャンセル可能期限：何時間前まで自動キャンセルを許容するか？（A院:12h / B院:24h を確認）
- [ ] 予約インターバル：自動余白は何分か？（B院: 30分固定 / A院: メニュー別か一律か確認）

**カルテ・記録**
- [ ] professional モードの部位・施術内容マスタ：初期データをクライアントが準備するか、デフォルト値を提供するか？
- [ ] 写真・動画の1件あたり・月あたりの容量上限は許容範囲内か？
- [ ] トレーニング種目マスタの初期データをA院が提供できるか？

**通知**
- [ ] LINE公式アカウントはクライアントが既に保有しているか？（Messaging API アクセストークン取得が必要）
- [ ] リマインダーのタイミング：予約の何時間前に送信するか？（例: 前日18時 + 2時間前）

**データ・セキュリティ**
- [ ] 患者データの管理責任（個人情報取扱規約）についてクライアントの同意を得ること。
- [ ] バックアップ・障害時のRTO/RPO要件の確認。

---

## 6. 非機能要件

### 6.1 セキュリティ

| 要件 | 内容 |
|---|---|
| 認証 | JWT（アクセストークン15分 / リフレッシュトークン30日）またはセッションCookie |
| テナント分離 | APIレイヤーで `tenant_id` を必ずバリデーション。他テナントへのアクセスは全拒否。 |
| 通信暗号化 | 全通信 HTTPS 必須（TLS 1.2以上） |
| メディア保存 | ストレージは署名付きURL（有効期限付き）でのみアクセス可能 |
| 個人情報 | PIPA（個人情報保護法）準拠。患者氏名・連絡先は暗号化カラムを検討 |

### 6.2 パフォーマンス

| 指標 | 目標値 |
|---|---|
| APIレスポンス（一般） | p95 < 500ms |
| カレンダー表示（週ビュー） | p95 < 1s |
| 同時接続 | 50テナント × 10セッション = 500セッション（MVP期） |

### 6.3 可用性

| 指標 | 目標値 |
|---|---|
| 稼働率 | 99.5%（MVP期）→ 99.9%（SaaS拡大後） |
| バックアップ | 日次スナップショット。保持7日間 |
| RTO / RPO | RTO: 4時間 / RPO: 24時間（MVP期） |

---

## 7. 未決事項・打ち合わせアジェンダ

以下の項目は次回クライアント打ち合わせで合意が必要。

| # | 項目 | 選択肢 | 優先度 |
|---|---|---|---|
| U-01 | バックエンドフレームワーク | Next.js API Routes / Fastify / Rails | 高 |
| U-02 | ホスティング | Vercel + Supabase / AWS / Render | 高 |
| U-03 | 認証基盤 | Supabase Auth / Auth.js / 自前JWT | 高 |
| U-04 | ファイルストレージ | Supabase Storage / S3 / Cloudflare R2 | 中 |
| U-05 | pending中の同一枠への重複予約 | 許容（先着確定） / 排他ロック | 高 |
| U-06 | LINE公式アカウントの準備状況 | A院・B院それぞれ確認 | 高 |
| U-07 | SaaSプランの価格体系 | 月額固定 / 従量課金 / ハイブリッド | 中 |
| U-08 | 初期データ移行 | 既存患者データの移行有無・フォーマット | 中 |

---

*本文書はドラフトです。クライアント合意後に正式版として更新してください。*
