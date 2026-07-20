import { assertDatabase, ensureDatabase, jsonError } from "../../../db/runtime";
import { requireUser } from "../../auth";

async function canAccessGroup(user: { id: number; role: string }, groupId: number, month: string) {
  if (user.role === "admin") return true;
  const db = await ensureDatabase();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate().toString().padStart(2, "0")}`;
  const { data: assignment, error } = await db.from("user_group_assignments").select("id")
    .eq("user_id", user.id).eq("group_id", groupId).lte("start_date", monthEnd).gte("end_date", monthStart).limit(1).maybeSingle();
  if (error) assertDatabase(null, error);
  return Boolean(assignment);
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
  const { data: inspection, error: inspectionError } = await db.from("monthly_inspections").select("*").eq("month", month).eq("group_id", groupId).maybeSingle();
  if (inspectionError) assertDatabase(null, inspectionError);
  if (!inspection) return Response.json({ inspection: null, responses: [], buses: [] });
  const [responsesResult, busesResult] = await Promise.all([
    db.from("inspection_responses").select("item_code, answer, note").eq("inspection_id", inspection.id).order("item_code"),
    db.from("monthly_inspection_buses").select("bus:buses(id, bus_number)").eq("inspection_id", inspection.id),
  ]);
  if (responsesResult.error) assertDatabase(null, responsesResult.error);
  if (busesResult.error) assertDatabase(null, busesResult.error);
  const buses = (busesResult.data ?? []).flatMap((item) => item.bus ?? []).sort((a, b) => a.bus_number - b.bus_number);
  return Response.json({ inspection, responses: responsesResult.data, buses });
}

export async function POST(request: Request) {
  const db = await ensureDatabase();
  const body = await request.json() as { month: string; groupId: number; status?: "draft" | "complete" | "submitted"; answers: InspectionAnswer[] };
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month) || !body.groupId || !Array.isArray(body.answers)) return jsonError("점검표 입력값을 확인하세요.");
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!(await canAccessGroup(user, body.groupId, body.month))) return jsonError("담당 차량이 포함된 점검표만 작성할 수 있습니다.", 403);
  if (user.demo) return jsonError("체험 모드에서는 실제 점검표를 저장하지 않습니다.", 403);
  const { data: activeItems, error: itemError } = await db.from("checklist_items").select("code, responsible_role").eq("active", 1).order("sort_order");
  if (itemError) assertDatabase(null, itemError);
  const items = (activeItems ?? []) as Array<{ code: string; responsible_role: "all" | "driver" | "attendant" }>;
  const answersToSave = user.role === "admin" ? body.answers : body.answers.filter((answer) => {
    const item = items.find((candidate) => candidate.code === answer.itemCode);
    return item && (item.responsible_role === "all" || item.responsible_role === user.role);
  });
  const { data: inspection, error: inspectionError } = await db.from("monthly_inspections").upsert({
    month: body.month,
    group_id: body.groupId,
    status: "draft",
  }, { onConflict: "month,group_id", ignoreDuplicates: true }).select("id").maybeSingle();
  if (inspectionError) assertDatabase(null, inspectionError);
  let inspectionId = inspection?.id;
  if (!inspectionId) {
    const result = await db.from("monthly_inspections").select("id").eq("month", body.month).eq("group_id", body.groupId).single();
    inspectionId = assertDatabase(result.data, result.error, "점검표를 저장하지 못했습니다.").id;
  }
  if (body.status === "complete") {
    const { data: existing, error } = await db.from("inspection_responses").select("item_code").eq("inspection_id", inspectionId);
    if (error) assertDatabase(null, error);
    const completedCodes = new Set([...(existing ?? []).map((item) => item.item_code), ...answersToSave.map((item) => item.itemCode)]);
    if (items.some((item) => !completedCodes.has(item.code))) return jsonError("모든 점검 항목을 확인한 뒤 완료할 수 있습니다.");
  }
  const update: { status: string; submitted_at?: string } = { status: body.status ?? "draft" };
  if (body.status === "submitted") update.submitted_at = new Date().toISOString();
  const updateResult = await db.from("monthly_inspections").update(update).eq("id", inspectionId);
  if (updateResult.error) assertDatabase(null, updateResult.error);

  const { count, error: countError } = await db.from("monthly_inspection_buses").select("id", { count: "exact", head: true }).eq("inspection_id", inspectionId);
  if (countError) assertDatabase(null, countError);
  if ((count ?? 0) === 0) {
    const { data: groupBuses, error } = await db.from("inspection_group_buses").select("bus_id").eq("group_id", body.groupId);
    if (error) assertDatabase(null, error);
    if (groupBuses?.length) {
      const snapshotResult = await db.from("monthly_inspection_buses").insert(groupBuses.map((item) => ({ inspection_id: inspectionId, bus_id: item.bus_id })));
      if (snapshotResult.error) assertDatabase(null, snapshotResult.error);
    }
  }
  if (answersToSave.length) {
    const { error } = await db.from("inspection_responses").upsert(answersToSave.map((item) => ({
      inspection_id: inspectionId,
      item_code: item.itemCode,
      answer: item.answer,
      note: item.note?.trim() || null,
    })), { onConflict: "inspection_id,item_code" });
    if (error) assertDatabase(null, error);
  }
  return Response.json({ ok: true, inspectionId });
}
