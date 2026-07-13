import { createPinHash, createSession, sessionCookie, validPin, validUsername } from "../../../auth";
import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const { data: admin, error: adminError } = await db.from("app_users")
    .select("id").eq("role", "admin").eq("active", 1).limit(1).maybeSingle();
  if (adminError) assertDatabase(null, adminError);
  if (admin) return jsonError("관리자 설정이 이미 완료되었습니다.", 403);
  const body = await request.json() as { username: string; pin: string; displayName?: string };
  const username = body.username?.trim();
  if (!validUsername(username) || !validPin(body.pin)) return jsonError("아이디는 3~24자, 간편 비밀번호는 숫자 4~12자리로 입력하세요.");
  const pin = await createPinHash(body.pin);
  const { data: created, error } = await db.from("app_users").insert({
    username,
    display_name: body.displayName?.trim() || "업무담당자",
    role: "admin",
    pin_salt: pin.salt,
    pin_hash: pin.hash,
  }).select("id").single();
  const result = assertDatabase(created, error, "관리자 계정을 만들지 못했습니다.");
  const session = await createSession(Number(result.id));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
