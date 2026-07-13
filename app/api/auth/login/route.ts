import { createSession, sessionCookie, validPin, validUsername, verifyPin } from "../../../auth";
import { ensureDatabase, jsonError } from "../../../../db/runtime";

export async function POST(request: Request) {
  const body = await request.json() as { username: string; pin: string };
  const username = body.username?.trim();
  if (!validUsername(username) || !validPin(body.pin)) return jsonError("아이디 또는 간편 비밀번호를 확인하세요.", 401);
  const db = await ensureDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const throttle = await db.prepare("SELECT attempt_count, window_started_at FROM login_throttles WHERE username = ?").bind(username).first<{ attempt_count: number; window_started_at: string }>();
  if (throttle && throttle.window_started_at > windowStart && throttle.attempt_count >= 5) return jsonError("로그인 시도가 많습니다. 15분 후 다시 시도하세요.", 429);
  const user = await db.prepare("SELECT id, pin_salt, pin_hash FROM app_users WHERE username = ? AND active = 1").bind(username).first<{ id: number; pin_salt: string; pin_hash: string }>();
  if (!user || !(await verifyPin(body.pin, user.pin_salt, user.pin_hash))) {
    await db.prepare("INSERT INTO login_throttles (username, attempt_count, window_started_at) VALUES (?, 1, ?) ON CONFLICT(username) DO UPDATE SET attempt_count = CASE WHEN window_started_at <= ? THEN 1 ELSE attempt_count + 1 END, window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END")
      .bind(username, now.toISOString(), windowStart, windowStart).run();
    return jsonError("아이디 또는 간편 비밀번호를 확인하세요.", 401);
  }
  await db.prepare("DELETE FROM login_throttles WHERE username = ?").bind(username).run();
  const session = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
