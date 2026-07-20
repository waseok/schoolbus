import { createSession, sessionCookie } from "../../../auth";
import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";

async function clientThrottleKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || `${request.headers.get("user-agent") ?? "unknown"}:unknown`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hash = Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `operation-client:${hash}`;
}

export async function POST(request: Request) {
  const body = await request.json() as { code?: string };
  const code = body.code?.trim() ?? "";
  if (!/^\d{4}$/.test(code)) return jsonError("관리자가 배부한 4자리 숫자 운행 코드를 입력하세요.", 401);
  const db = await ensureDatabase();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const throttleKeys = [`operation:${code}`, await clientThrottleKey(request)];
  const { data: throttles, error: throttleError } = await db.from("login_throttles")
    .select("username, attempt_count, window_started_at").in("username", throttleKeys);
  if (throttleError) assertDatabase(null, throttleError);
  const codeThrottle = throttles?.find((item) => item.username === throttleKeys[0]);
  const clientThrottle = throttles?.find((item) => item.username === throttleKeys[1]);
  if ((codeThrottle && codeThrottle.window_started_at > windowStart && codeThrottle.attempt_count >= 5)
    || (clientThrottle && clientThrottle.window_started_at > windowStart && clientThrottle.attempt_count >= 10)) {
    return jsonError("운행 코드 입력 시도가 많습니다. 15분 후 다시 시도하세요.", 429);
  }
  const { data: user, error: userError } = await db.from("app_users")
    .select("id").eq("username", code).eq("active", 1).in("role", ["driver", "attendant"]).maybeSingle();
  if (userError) assertDatabase(null, userError);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const { data: assignment, error: assignmentError } = user ? await db.from("user_group_assignments")
    .select("id").eq("user_id", user.id).lte("start_date", today).gte("end_date", today).limit(1).maybeSingle() : { data: null, error: null };
  if (assignmentError) assertDatabase(null, assignmentError);
  if (!user || !assignment) {
    const attempts = throttleKeys.map((key) => {
      const throttle = throttles?.find((item) => item.username === key);
      const resetWindow = !throttle || throttle.window_started_at <= windowStart;
      return {
        username: key,
        attempt_count: resetWindow ? 1 : Number(throttle.attempt_count) + 1,
        window_started_at: resetWindow ? now.toISOString() : throttle.window_started_at,
      };
    });
    const { error } = await db.from("login_throttles").upsert(attempts, { onConflict: "username" });
    if (error) assertDatabase(null, error);
    return jsonError("유효하지 않거나 사용 기간이 지난 운행 코드입니다.", 401);
  }
  const { error: deleteError } = await db.from("login_throttles").delete().in("username", throttleKeys);
  if (deleteError) assertDatabase(null, deleteError);
  const session = await createSession(user.id);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
