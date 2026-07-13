import { clearSessionCookie, revokeCurrentSession } from "../../../auth";

export async function POST(request: Request) {
  await revokeCurrentSession(request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request) } });
}
