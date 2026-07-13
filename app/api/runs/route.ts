import { assertDatabase, ensureDatabase, jsonError } from "../../../db/runtime";
import { canAccessBus, requireUser } from "../../auth";

type BoardingInput = { studentId: number; boarded: boolean; note?: string };

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const busId = Number(url.searchParams.get("busId"));
  const date = url.searchParams.get("date");
  if (!busId || !date) return jsonError("운행 조회 조건이 올바르지 않습니다.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessBus(user, busId, date))) return jsonError("담당 차량만 조회할 수 있습니다.", 403);

  const { data: run, error: runError } = await db.from("daily_runs").select("*").eq("bus_id", busId).eq("date", date).maybeSingle();
  if (runError) assertDatabase(null, runError);
  if (!run) return Response.json({ run: null, boarding: [] });
  const { data: boarding, error } = await db.from("boarding_records").select("student_id, boarded, note").eq("daily_run_id", run.id);
  if (error) assertDatabase(null, error);
  return Response.json({ run, boarding });
}

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const body = await request.json() as { busId: number; date: string; status: "operated" | "not_operated"; reason?: string; note?: string; boarding?: BoardingInput[] };
  if (!body.busId || !body.date || !["operated", "not_operated"].includes(body.status)) return jsonError("운행일지 입력값을 확인하세요.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessBus(user, body.busId, body.date))) return jsonError("담당 차량만 기록할 수 있습니다.", 403);

  const { data: run, error: runError } = await db.from("daily_runs").upsert({
    bus_id: body.busId,
    date: body.date,
    status: body.status,
    reason: body.reason?.trim() || null,
    note: body.note?.trim() || null,
  }, { onConflict: "bus_id,date" }).select("id").single();
  const savedRun = assertDatabase(run, runError, "운행일지를 저장하지 못했습니다.");

  if (body.boarding?.length) {
    const { error } = await db.from("boarding_records").upsert(body.boarding.map((item) => ({
      daily_run_id: savedRun.id,
      student_id: item.studentId,
      boarded: item.boarded ? 1 : 0,
      note: item.note?.trim() || null,
    })), { onConflict: "daily_run_id,student_id" });
    if (error) assertDatabase(null, error);
  }
  return Response.json({ ok: true, runId: savedRun.id });
}
