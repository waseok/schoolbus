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
  if (user.demo) {
    return Response.json({
      run: { id: 0, bus_id: busId, date, status: "operated", reason: null, note: "체험용 운행일지" },
      boarding: [
        { student_id: 9001, boarded: 1, note: null },
        { student_id: 9002, boarded: 1, note: null },
        { student_id: 9003, boarded: 0, note: "병원 진료" },
      ],
    });
  }

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
  if (user.demo) return jsonError("체험 모드에서는 실제 운행일지를 저장하지 않습니다.", 403);

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

export async function PATCH(request: Request) {
  const db = await ensureDatabase();
  const body = await request.json() as { busId: number; date: string; assignmentIds: number[] };
  if (!Number.isInteger(body.busId) || body.busId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "") || !Array.isArray(body.assignmentIds) || body.assignmentIds.length === 0 || body.assignmentIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(body.assignmentIds).size !== body.assignmentIds.length) return jsonError("학생 탑승 순서 정보가 올바르지 않습니다.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessBus(user, body.busId, body.date))) return jsonError("담당 차량의 학생 순서만 변경할 수 있습니다.", 403);
  if (user.demo) return jsonError("체험 모드에서는 학생 탑승 순서를 저장하지 않습니다.", 403);

  const { data: activeAssignments, error: assignmentError } = await db.from("assignments").select("id")
    .eq("bus_id", body.busId)
    .lte("start_date", body.date)
    .gte("end_date", body.date)
    .in("id", body.assignmentIds);
  if (assignmentError) assertDatabase(null, assignmentError, "학생 배정 정보를 확인하지 못했습니다.");
  if ((activeAssignments?.length ?? 0) !== body.assignmentIds.length) return jsonError("현재 운행일에 배정된 학생만 순서를 변경할 수 있습니다.", 409);

  const { data, error } = await db.rpc("reorder_bus_assignments", { p_bus_id: body.busId, p_assignment_ids: body.assignmentIds });
  if (error) assertDatabase(null, error, "학생 탑승 순서를 저장하지 못했습니다.");
  if (Number(data) !== body.assignmentIds.length) return jsonError("일부 학생의 탑승 순서를 저장하지 못했습니다.", 409);
  return Response.json({ ok: true });
}
