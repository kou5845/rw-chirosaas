#!/bin/bash
# ステージングDBへ Prisma スキーマをプッシュするスクリプト
# 使い方: bash scripts/push-staging-schema.sh

set -e

ENV_FILE=".env.local"
STAGING_FILE=".env.staging"
BACKUP_FILE=".env.local.production-backup"

# バックアップ確認
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ バックアップが見つかりません: $BACKUP_FILE"
  echo "   先に: cp .env.local .env.local.production-backup"
  exit 1
fi

# ステージング用envファイル確認
if [ ! -f "$STAGING_FILE" ]; then
  echo "❌ ステージング用envファイルが見つかりません: $STAGING_FILE"
  echo "   .env.staging を作成してから再実行してください"
  exit 1
fi

echo "🔄 .env.local をステージング用に一時切り替え中..."
cp "$ENV_FILE" "/tmp/env_local_current_backup"
cp "$STAGING_FILE" "$ENV_FILE"

echo "🚀 npx prisma db push を実行中..."
npx prisma db push

echo "🔄 .env.local を本番用に復元中..."
cp "/tmp/env_local_current_backup" "$ENV_FILE"

echo "✅ 完了！ステージングDBにスキーマが反映されました。"
echo "   .env.local は本番用に戻っています。"
