import { createSession, sessionCookie, validPin, validUsername, verifyPin } from "../../../auth";
import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";

export async function POST(request: Request) {
  const body = await request.json() as { username: string; pin: string };
  const username = body.username?.trim();
  if (!validUsername(username) || !validPin(body.pin)) return jsonError("아이디 또는 간편 비밀번호를 확인하세요.", 401);
  const db = await ensureDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const { data: throttle, error: throttleError } = await db.from("login_throttles")
    .select("attempt_count, window_started_at").eq("username", username).maybeSingle();
  if (throttleError) assertDatabase(null, throttleError);
  if (throttle && throttle.window_started_at > windowStart && throttle.attempt_count >= 5) return jsonError("로그인 시도가 많습니다. 15분 후 다시 시도하세요.", 429);
  const { data: user, error: userError } = await db.from("app_users")
    .select("id, pin_salt, pin_hash, role").eq("username", username).eq("active", 1).maybeSingle();
  if (userError) assertDatabase(null, userError);
  if (!user || user.role !== "admin" || !(await verifyPin(body.pin, user.pin_salt, user.pin_hash))) {
    const resetWindow = !throttle || throttle.window_started_at <= windowStart;
    const { error } = await db.from("login_throttles").upsert({
      username,
      attempt_count: resetWindow ? 1 : Number(throttle.attempt_count) + 1,
      window_started_at: resetWindow ? now.toISOString() : throttle.window_started_at,
    }, { onConflict: "username" });
    if (error) assertDatabase(null, error);
    return jsonError("아이디 또는 간편 비밀번호를 확인하세요.", 401);
  }
  const { error: deleteError } = await db.from("login_throttles").delete().eq("username", username);
  if (deleteError) assertDatabase(null, deleteError);
  const session = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
