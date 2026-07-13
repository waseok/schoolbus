import { ensureDatabase, jsonError } from "../../../db/runtime";
import { requireUser } from "../../auth";

async function canAccessGroup(user: { id: number; role: string }, groupId: number, month: string) {
  if (user.role === "admin") return true;
  const db = await ensureDatabase();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`;
  const row = await db.prepare("SELECT igb.id FROM inspection_group_buses igb JOIN user_bus_assignments uba ON uba.bus_id = igb.bus_id WHERE igb.group_id = ? AND uba.user_id = ? AND uba.start_date <= ? AND uba.end_date >= ? LIMIT 1")
    .bind(groupId, user.id, monthEnd, monthStart).first();
  return Boolean(row);
}

type InspectionAnswer = { itemCode: string; answer: "yes" | "no" | "not_applicable"; note?: string };

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  const groupId = Number(url.searchParams.get("groupId"));
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "") || !groupId) return jsonError("점검 조회 조건을 확인하세요.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessGroup(user, groupId, month!))) return jsonError("담당 차량이 포함된 점검표만 조회할 수 있습니다.", 403);
  const inspection = await db.prepare("SELECT * FROM monthly_inspections WHERE month = ? AND group_id = ?").bind(month, groupId).first<{ id: number }>();
  const responses = inspection ? await db.prepare("SELECT item_code, answer, note FROM inspection_responses WHERE inspection_id = ? ORDER BY item_code").bind(inspection.id).all() : { results: [] };
  const buses = inspection ? await db.prepare("SELECT b.id, b.bus_number FROM monthly_inspection_buses mib JOIN buses b ON b.id = mib.bus_id WHERE mib.inspection_id = ? ORDER BY b.bus_number").bind(inspection.id).all() : { results: [] };
  return Response.json({ inspection: inspection ?? null, responses: responses.results, buses: buses.results });
}

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const body = await request.json() as { month: string; groupId: number; status?: "draft" | "complete" | "submitted"; answers: InspectionAnswer[] };
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month) || !body.groupId || !Array.isArray(body.answers)) return jsonError("점검표 입력값을 확인하세요.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessGroup(user, body.groupId, body.month))) return jsonError("담당 차량이 포함된 점검표만 작성할 수 있습니다.", 403);
  const activeItems = await db.prepare("SELECT code, responsible_role FROM checklist_items WHERE active = 1 ORDER BY sort_order").all<{ code: string; responsible_role: "all" | "driver" | "attendant" }>();
  const answersToSave = user.role === "admin" ? body.answers : body.answers.filter((answer) => {
    const item = activeItems.results.find((candidate) => candidate.code === answer.itemCode);
    return item && (item.responsible_role === "all" || item.responsible_role === user.role);
  });
  await db.prepare("INSERT INTO monthly_inspections (month, group_id, status) VALUES (?, ?, 'draft') ON CONFLICT(month, group_id) DO NOTHING")
    .bind(body.month, body.groupId).run();
  const inspection = await db.prepare("SELECT id FROM monthly_inspections WHERE month = ? AND group_id = ?").bind(body.month, body.groupId).first<{ id: number }>();
  if (!inspection) return jsonError("점검표를 저장하지 못했습니다.", 500);
  if (body.status === "complete") {
    const existing = await db.prepare("SELECT item_code FROM inspection_responses WHERE inspection_id = ?").bind(inspection.id).all<{ item_code: string }>();
    const completedCodes = new Set([...existing.results.map((item) => item.item_code), ...answersToSave.map((item) => item.itemCode)]);
    if (activeItems.results.some((item) => !completedCodes.has(item.code))) return jsonError("모든 점검 항목을 확인한 뒤 완료할 수 있습니다.");
  }
  await db.prepare("UPDATE monthly_inspections SET status = ?, submitted_at = CASE WHEN ? = 'submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END WHERE id = ?")
    .bind(body.status ?? "draft", body.status ?? "draft", inspection.id).run();
  const snapshot = await db.prepare("SELECT COUNT(*) AS count FROM monthly_inspection_buses WHERE inspection_id = ?").bind(inspection.id).first<{ count: number }>();
  if (Number(snapshot?.count ?? 0) === 0) {
    await db.prepare("INSERT INTO monthly_inspection_buses (inspection_id, bus_id) SELECT ?, bus_id FROM inspection_group_buses WHERE group_id = ?")
      .bind(inspection.id, body.groupId).run();
  }
  if (answersToSave.length) {
    await db.batch(answersToSave.map((item) => db.prepare("INSERT INTO inspection_responses (inspection_id, item_code, answer, note) VALUES (?, ?, ?, ?) ON CONFLICT(inspection_id, item_code) DO UPDATE SET answer = excluded.answer, note = excluded.note")
      .bind(inspection.id, item.itemCode, item.answer, item.note?.trim() || null)));
  }
  return Response.json({ ok: true, inspectionId: inspection.id });
}
