import { currentUser } from "../../../auth";
import { ensureDatabase } from "../../../../db/runtime";

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const admin = await db.prepare("SELECT id FROM app_users WHERE role = 'admin' AND active = 1 LIMIT 1").first();
  if (!admin) return Response.json({ user: null, needsSetup: true });
  const user = await currentUser(request);
  return Response.json({ user, needsSetup: false }, { status: user ? 200 : 401 });
}
