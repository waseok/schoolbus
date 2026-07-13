import { clearDemoSessionCookie, clearSessionCookie, revokeCurrentSession } from "../../../auth";

export async function POST(request: Request) {
  await revokeCurrentSession(request);
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie(request));
  headers.append("Set-Cookie", clearDemoSessionCookie(request));
  return Response.json({ ok: true }, { headers });
}
