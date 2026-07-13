import { demoSessionCookie } from "../../../auth";

export async function POST(request: Request) {
  const user = { id: 0, username: "demo", display_name: "체험 관리자", role: "admin" as const, demo: true };
  return Response.json({ user }, { headers: { "Set-Cookie": demoSessionCookie(request) } });
}
