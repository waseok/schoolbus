import { ensureDatabase, jsonError } from "../../../db/runtime";
import { createPinHash, requireUser, validPin, validUsername } from "../../auth";

type DataAction =
  | { action: "saveBus"; id: number; plateNumber?: string; driverName?: string; attendantName?: string }
  | { action: "addStudent"; name: string; grade: number; className: string }
  | { action: "addStudentAndAssign"; name: string; grade: number; className: string; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "saveAssignment"; studentId: number; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "reassignStudent"; studentId: number; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "addExclusion"; date: string; kind: "discretionary_holiday" | "emergency" | "other"; note?: string }
  | { action: "deleteExclusion"; id: number }
  | { action: "saveGroupBuses"; groupId: number; busIds: number[] }
  | { action: "addGroup"; name: string }
  | { action: "deleteGroup"; groupId: number }
  | { action: "updateChecklistItem"; id: number; content: string; responsibleRole: "all" | "driver" | "attendant" }
  | { action: "addUser"; username: string; pin: string; displayName?: string; role: "admin" | "driver" | "attendant"; busId?: number; startDate?: string; endDate?: string }
  | { action: "saveSettings"; schoolYear: number; startDate: string; endDate: string; includeLaborDay: boolean; includeElectionDay: boolean };

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const db = await ensureDatabase();
  const [settings, buses, students, assignments, exclusions, groups, groupBuses, users, userBuses, checklistItems] = await Promise.all([
    db.prepare("SELECT * FROM school_settings WHERE id = 1").first(),
    db.prepare("SELECT * FROM buses WHERE active = 1 ORDER BY bus_number").all(),
    db.prepare("SELECT * FROM students WHERE active = 1 ORDER BY grade, class_name, name").all(),
    db.prepare("SELECT * FROM assignments ORDER BY start_date DESC").all(),
    db.prepare("SELECT * FROM calendar_exclusions ORDER BY date").all(),
    db.prepare("SELECT * FROM inspection_groups WHERE active = 1 ORDER BY id").all(),
    db.prepare("SELECT * FROM inspection_group_buses ORDER BY group_id, bus_id").all(),
    db.prepare("SELECT id, username, display_name, role, active FROM app_users WHERE active = 1 ORDER BY role, display_name, username").all(),
    db.prepare("SELECT * FROM user_bus_assignments ORDER BY start_date DESC").all(),
    db.prepare("SELECT id, code, category, content, responsible_role, sort_order FROM checklist_items WHERE active = 1 ORDER BY sort_order").all(),
  ]);
  if (user.role === "admin") return Response.json({ settings, buses: buses.results, students: students.results, assignments: assignments.results, exclusions: exclusions.results, groups: groups.results, groupBuses: groupBuses.results, users: users.results, userBuses: userBuses.results, checklistItems: checklistItems.results });
  const allowed = Array.from(new Set((userBuses.results as Array<{ user_id: number; bus_id: number }>).filter((item) => item.user_id === user.id).map((item) => item.bus_id)));
  const visibleAssignments = (assignments.results as Array<{ id: number; student_id: number; bus_id: number }>).filter((item) => allowed.includes(item.bus_id));
  const visibleStudentIds = visibleAssignments.map((item) => item.student_id);
  return Response.json({ settings, buses: (buses.results as Array<{ id: number }>).filter((item) => allowed.includes(item.id)), students: (students.results as Array<{ id: number }>).filter((item) => visibleStudentIds.includes(item.id)), assignments: visibleAssignments, exclusions: exclusions.results, groups: (groups.results as Array<{ id: number }>).filter((group) => (groupBuses.results as Array<{ group_id: number; bus_id: number }>).some((item) => item.group_id === group.id && allowed.includes(item.bus_id))), groupBuses: (groupBuses.results as Array<{ bus_id: number }>).filter((item) => allowed.includes(item.bus_id)), users: [], userBuses: [], checklistItems: checklistItems.results });
}

export async function POST(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  const db = await ensureDatabase();
  const body = await request.json() as DataAction;

  if (body.action === "saveBus") {
    if (!Number.isInteger(body.id)) return jsonError("차량 정보가 올바르지 않습니다.");
    await db.prepare("UPDATE buses SET plate_number = ?, driver_name = ?, attendant_name = ? WHERE id = ?")
      .bind(body.plateNumber?.trim() || null, body.driverName?.trim() || null, body.attendantName?.trim() || null, body.id).run();
  } else if (body.action === "addStudent") {
    if (!body.name?.trim() || !Number.isInteger(body.grade) || !body.className?.trim()) return jsonError("학생 이름, 학년, 반을 모두 입력하세요.");
    await db.prepare("INSERT INTO students (name, grade, class_name) VALUES (?, ?, ?)").bind(body.name.trim(), body.grade, body.className.trim()).run();
  } else if (body.action === "addStudentAndAssign") {
    if (!body.name?.trim() || !Number.isInteger(body.grade) || !body.className?.trim() || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생 정보와 차량 배정 기간을 확인하세요.");
    const inserted = await db.prepare("INSERT INTO students (name, grade, class_name) VALUES (?, ?, ?)").bind(body.name.trim(), body.grade, body.className.trim()).run();
    await db.prepare("INSERT INTO assignments (student_id, bus_id, stop_name, start_date, end_date) VALUES (?, ?, ?, ?, ?)")
      .bind(Number(inserted.meta.last_row_id), body.busId, body.stopName?.trim() || null, body.startDate, body.endDate).run();
  } else if (body.action === "saveAssignment") {
    if (!body.studentId || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생 배정 기간을 확인하세요.");
    const overlap = await db.prepare("SELECT id FROM assignments WHERE student_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1")
      .bind(body.studentId, body.endDate, body.startDate).first();
    if (overlap) return jsonError("이 학생은 해당 기간에 이미 다른 차량에 배정되어 있습니다.");
    await db.prepare("INSERT INTO assignments (student_id, bus_id, stop_name, start_date, end_date) VALUES (?, ?, ?, ?, ?)")
      .bind(body.studentId, body.busId, body.stopName?.trim() || null, body.startDate, body.endDate).run();
  } else if (body.action === "reassignStudent") {
    if (!body.studentId || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생과 새 배정 기간을 확인하세요.");
    const overlapping = await db.prepare("SELECT id, start_date FROM assignments WHERE student_id = ? AND start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1")
      .bind(body.studentId, body.startDate, body.startDate).first<{ id: number; start_date: string }>();
    if (overlapping) {
      if (overlapping.start_date >= body.startDate) return jsonError("같은 날짜에 시작하는 다른 차량 배정이 있습니다.");
      const previousDay = new Date(`${body.startDate}T12:00:00Z`);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      await db.prepare("UPDATE assignments SET end_date = ? WHERE id = ?").bind(previousDay.toISOString().slice(0, 10), overlapping.id).run();
    }
    const futureOverlap = await db.prepare("SELECT id FROM assignments WHERE student_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1")
      .bind(body.studentId, body.endDate, body.startDate).first();
    if (futureOverlap) return jsonError("새 배정 기간과 겹치는 다른 차량 배정이 있습니다.");
    await db.prepare("INSERT INTO assignments (student_id, bus_id, stop_name, start_date, end_date) VALUES (?, ?, ?, ?, ?)")
      .bind(body.studentId, body.busId, body.stopName?.trim() || null, body.startDate, body.endDate).run();
  } else if (body.action === "addExclusion") {
    if (!body.date) return jsonError("제외 날짜를 입력하세요.");
    await db.prepare("INSERT INTO calendar_exclusions (date, kind, note) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kind = excluded.kind, note = excluded.note")
      .bind(body.date, body.kind, body.note?.trim() || null).run();
  } else if (body.action === "deleteExclusion") {
    await db.prepare("DELETE FROM calendar_exclusions WHERE id = ?").bind(body.id).run();
  } else if (body.action === "saveGroupBuses") {
    if (!body.groupId || !Array.isArray(body.busIds) || body.busIds.length === 0) return jsonError("점검 세트에 한 대 이상의 차량을 선택하세요.");
    await db.prepare("DELETE FROM inspection_group_buses WHERE group_id = ?").bind(body.groupId).run();
    const placeholders = body.busIds.map(() => "?").join(",");
    await db.prepare(`DELETE FROM inspection_group_buses WHERE group_id <> ? AND bus_id IN (${placeholders})`).bind(body.groupId, ...body.busIds).run();
    await db.batch(body.busIds.map((busId) => db.prepare("INSERT INTO inspection_group_buses (group_id, bus_id) VALUES (?, ?)").bind(body.groupId, busId)));
  } else if (body.action === "addGroup") {
    if (!body.name?.trim()) return jsonError("점검 세트 이름을 입력하세요.");
    await db.prepare("INSERT INTO inspection_groups (name) VALUES (?)").bind(body.name.trim()).run();
  } else if (body.action === "deleteGroup") {
    const groupCount = await db.prepare("SELECT COUNT(*) AS count FROM inspection_groups WHERE active = 1").first<{ count: number }>();
    if (Number(groupCount?.count ?? 0) <= 1) return jsonError("점검 세트는 한 개 이상 필요합니다.");
    await db.prepare("DELETE FROM inspection_group_buses WHERE group_id = ?").bind(body.groupId).run();
    await db.prepare("UPDATE inspection_groups SET active = 0 WHERE id = ?").bind(body.groupId).run();
  } else if (body.action === "updateChecklistItem") {
    if (!body.id || !body.content?.trim() || !["all", "driver", "attendant"].includes(body.responsibleRole)) return jsonError("점검 문구와 담당 역할을 확인하세요.");
    await db.prepare("UPDATE checklist_items SET content = ?, responsible_role = ? WHERE id = ?")
      .bind(body.content.trim(), body.responsibleRole, body.id).run();
  } else if (body.action === "addUser") {
    const username = body.username?.trim();
    if (!validUsername(username) || !validPin(body.pin) || !["admin", "driver", "attendant"].includes(body.role)) return jsonError("아이디, 간편 비밀번호와 역할을 확인하세요.");
    const pin = await createPinHash(body.pin);
    await db.prepare("INSERT INTO app_users (username, display_name, role, pin_salt, pin_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(username) DO UPDATE SET display_name = excluded.display_name, role = excluded.role, pin_salt = excluded.pin_salt, pin_hash = excluded.pin_hash, active = 1")
      .bind(username, body.displayName?.trim() || null, body.role, pin.salt, pin.hash).run();
    const createdUser = await db.prepare("SELECT id FROM app_users WHERE username = ?").bind(username).first<{ id: number }>();
    if (createdUser) await db.prepare("DELETE FROM user_bus_assignments WHERE user_id = ?").bind(createdUser.id).run();
    if (body.role !== "admin" && body.busId && body.startDate && body.endDate) {
      if (createdUser) await db.prepare("INSERT INTO user_bus_assignments (user_id, bus_id, start_date, end_date) VALUES (?, ?, ?, ?)").bind(createdUser.id, body.busId, body.startDate, body.endDate).run();
    }
  } else if (body.action === "saveSettings") {
    if (!body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("운행 기간을 확인하세요.");
    await db.prepare("UPDATE school_settings SET school_year = ?, start_date = ?, end_date = ?, include_labor_day = ?, include_election_day = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
      .bind(body.schoolYear, body.startDate, body.endDate, body.includeLaborDay ? 1 : 0, body.includeElectionDay ? 1 : 0).run();
  } else {
    return jsonError("지원하지 않는 작업입니다.");
  }

  return Response.json({ ok: true });
}
