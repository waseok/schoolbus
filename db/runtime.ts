import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getDatabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("Supabase 서버 연결 정보가 없습니다. SUPABASE_URL과 SUPABASE_SECRET_KEY를 서버 환경변수로 설정하세요.");
  }
  client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

export async function ensureDatabase(): Promise<SupabaseClient> {
  return getDatabase();
}

export function assertDatabase<T>(data: T | null, error: PostgrestError | null, fallback = "데이터베이스 작업에 실패했습니다."): T {
  if (error) {
    console.error("Supabase database error", error.code, error.message);
    throw new Error(fallback);
  }
  if (data === null) throw new Error(fallback);
  return data;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
