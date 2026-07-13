import { createPinHash, createSession, sessionCookie, validPin, validUsername } from "../../../auth";
import { ensureDatabase, jsonError } from "../../../../db/runtime";

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const admin = await db.prepare("SELECT id FROM app_users WHERE role = 'admin' AND active = 1 LIMIT 1").first();
  if (admin) return jsonError("관리자 설정이 이미 완료되었습니다.", 403);
  const body = await request.json() as { username: string; pin: string; displayName?: string };
  const username = body.username?.trim();
  if (!validUsername(username) || !validPin(body.pin)) return jsonError("아이디는 3~24자, 간편 비밀번호는 숫자 4~12자리로 입력하세요.");
  const pin = await createPinHash(body.pin);
  const result = await db.prepare("INSERT INTO app_users (username, display_name, role, pin_salt, pin_hash) VALUES (?, ?, 'admin', ?, ?)")
    .bind(username, body.displayName?.trim() || "업무담당자", pin.salt, pin.hash).run();
  const session = await createSession(Number(result.meta.last_row_id));
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(request, session.token, session.maxAge) } });
}
