#!/bin/bash
# ステージングDBにテストデータを投入するスクリプト
# 使い方: bash scripts/run-staging-seed.sh

set -e

ENV_FILE=".env.local"
STAGING_FILE=".env.staging"
BACKUP_FILE=".env.local.production-backup"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ バックアップが見つかりません: $BACKUP_FILE"
  exit 1
fi

if [ ! -f "$STAGING_FILE" ]; then
  echo "❌ ステージング用envファイルが見つかりません: $STAGING_FILE"
  exit 1
fi

echo "🔄 .env.local をステージング用に一時切り替え中..."
cp "$ENV_FILE" "/tmp/env_local_current_backup"
cp "$STAGING_FILE" "$ENV_FILE"

echo "🌱 シードスクリプトを実行中..."
npx tsx scripts/seed-staging.ts

echo "🔄 .env.local を本番用に復元中..."
cp "/tmp/env_local_current_backup" "$ENV_FILE"

echo "✅ 完了！"
