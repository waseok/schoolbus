import { ensureDatabase, jsonError } from "../../../db/runtime";
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

  const run = await db.prepare("SELECT * FROM daily_runs WHERE bus_id = ? AND date = ?").bind(busId, date).first<{ id: number }>();
  const boarding = run ? await db.prepare("SELECT student_id, boarded, note FROM boarding_records WHERE daily_run_id = ?").bind(run.id).all() : { results: [] };
  return Response.json({ run: run ?? null, boarding: boarding.results });
}

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const body = await request.json() as { busId: number; date: string; status: "operated" | "not_operated"; reason?: string; note?: string; boarding?: BoardingInput[] };
  if (!body.busId || !body.date || !["operated", "not_operated"].includes(body.status)) return jsonError("운행일지 입력값을 확인하세요.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessBus(user, body.busId, body.date))) return jsonError("담당 차량만 기록할 수 있습니다.", 403);

  await db.prepare("INSERT INTO daily_runs (bus_id, date, status, reason, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bus_id, date) DO UPDATE SET status = excluded.status, reason = excluded.reason, note = excluded.note")
    .bind(body.busId, body.date, body.status, body.reason?.trim() || null, body.note?.trim() || null).run();
  const run = await db.prepare("SELECT id FROM daily_runs WHERE bus_id = ? AND date = ?").bind(body.busId, body.date).first<{ id: number }>();
  if (!run) return jsonError("운행일지를 저장하지 못했습니다.", 500);

  if (body.boarding?.length) {
    await db.batch(body.boarding.map((item) => db.prepare("INSERT INTO boarding_records (daily_run_id, student_id, boarded, note) VALUES (?, ?, ?, ?) ON CONFLICT(daily_run_id, student_id) DO UPDATE SET boarded = excluded.boarded, note = excluded.note")
      .bind(run.id, item.studentId, item.boarded ? 1 : 0, item.note?.trim() || null)));
  }
  return Response.json({ ok: true, runId: run.id });
}
