/**
 * Supabase クライアント
 *
 * - createSupabasePublic()  : ブラウザ用（anon key）
 * - createSupabaseAdmin()   : サーバー専用（service role key）
 *   ⚠️ service role key はサーバーサイドのみ使用すること（クライアントに渡さない）
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createSupabasePublic() {
  return createClient(supabaseUrl, supabaseAnon);
}

/** サーバーサイド専用。Route Handler / Server Action 内でのみ呼ぶこと。 */
export function createSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** カルテメディアバケット名 */
export const KARTE_MEDIA_BUCKET = "karte-media";
