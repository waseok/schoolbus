import { currentUser } from "../../../auth";
import { assertDatabase, ensureDatabase } from "../../../../db/runtime";

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const { data: admin, error } = await db.from("app_users")
    .select("id").eq("role", "admin").eq("active", 1).limit(1).maybeSingle();
  if (error) assertDatabase(null, error);
  if (!admin) return Response.json({ user: null, needsSetup: true });
  const user = await currentUser(request);
  return Response.json({ user, needsSetup: false }, { status: user ? 200 : 401 });
}
