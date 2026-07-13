import { createSession, sessionCookie } from "../../../auth";
import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";

export async function POST(request: Request) {
  const body = await request.json() as { code?: string };
  const code = body.code?.trim().toUpperCase() ?? "";
  if (!/^BUS-[A-Z2-9]{8}$/.test(code)) return jsonError("관리자가 배부한 운행 코드를 입력하세요.", 401);
  const db = await ensureDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const throttleKey = `operation:${code}`;
  const { data: throttle, error: throttleError } = await db.from("login_throttles")
    .select("attempt_count, window_started_at").eq("username", throttleKey).maybeSingle();
  if (throttleError) assertDatabase(null, throttleError);
  if (throttle && throttle.window_started_at > windowStart && throttle.attempt_count >= 5) return jsonError("운행 코드 입력 시도가 많습니다. 15분 후 다시 시도하세요.", 429);
  const { data: user, error: userError } = await db.from("app_users")
    .select("id").eq("username", code).eq("active", 1).in("role", ["driver", "attendant"]).maybeSingle();
  if (userError) assertDatabase(null, userError);
  const today = now.toISOString().slice(0, 10);
  const { data: assignment, error: assignmentError } = user ? await db.from("user_bus_assignments")
    .select("id").eq("user_id", user.id).lte("start_date", today).gte("end_date", today).limit(1).maybeSingle() : { data: null, error: null };
  if (assignmentError) assertDatabase(null, assignmentError);
  if (!user || !assignment) {
    const resetWindow = !throttle || throttle.window_started_at <= windowStart;
    const { error } = await db.from("login_throttles").upsert({
      username: throttleKey,
      attempt_count: resetWindow ? 1 : Number(throttle.attempt_count) + 1,
      window_started_at: resetWindow ? now.toISOString() : throttle.window_started_at,
    }, { onConflict: "username" });
    if (error) assertDatabase(null, error);
    return jsonError("유효하지 않거나 사용 기간이 지난 운행 코드입니다.", 401);
  }
  const { error: deleteError } = await db.from("login_throttles").delete().eq("username", throttleKey);
  if (deleteError) assertDatabase(null, deleteError);
  const session = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
