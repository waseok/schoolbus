import { assertDatabase, ensureDatabase, jsonError } from "../../../db/runtime";
import { createPinHash, requireUser } from "../../auth";

type DataAction =
  | { action: "saveBus"; id: number; plateNumber?: string; driverName?: string; attendantName?: string }
  | { action: "addStudent"; name: string; grade: number; className: string }
  | { action: "updateStudent"; id: number; name: string; grade: number; className: string; assignmentId?: number; stopName?: string }
  | { action: "addStudentAndAssign"; name: string; grade: number; className: string; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "saveAssignment"; studentId: number; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "reassignStudent"; studentId: number; busId: number; stopName?: string; startDate: string; endDate: string }
  | { action: "deleteAssignment"; assignmentId: number }
  | { action: "moveAssignment"; assignmentId: number; busId: number }
  | { action: "deleteBusAssignments"; busId: number }
  | { action: "deleteAllStudents" }
  | { action: "addExclusion"; date: string; kind: "discretionary_holiday" | "emergency" | "other"; note?: string }
  | { action: "deleteExclusion"; id: number }
  | { action: "saveGroupBuses"; groupId: number; busIds: number[] }
  | { action: "addGroup"; name: string }
  | { action: "deleteGroup"; groupId: number }
  | { action: "updateChecklistItem"; id: number; content: string; responsibleRole: "all" | "driver" | "attendant" }
  | { action: "issueOperationCode"; displayName?: string; role: "driver" | "attendant"; busId: number; startDate: string; endDate: string }
  | { action: "saveSettings"; schoolYear: number; startDate: string; endDate: string; semester1StartDate: string; semester1EndDate: string; semester2StartDate: string; semester2EndDate: string; includeLaborDay: boolean; includeElectionDay: boolean };

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const db = await ensureDatabase();
  const scope = new URL(request.url).searchParams.get("scope");

  if (scope === "management") {
    if (user.role !== "admin" && !user.demo) return Response.json({ groups: [], groupBuses: [], users: [], userBuses: [], checklistItems: [] });
    const results = await Promise.all([
      db.from("inspection_groups").select("*").eq("active", 1).order("id"),
      db.from("inspection_group_buses").select("*").order("group_id").order("bus_id"),
      db.from("app_users").select("id, username, display_name, role, active").eq("active", 1).order("role").order("display_name").order("username"),
      db.from("user_bus_assignments").select("*").order("start_date", { ascending: false }),
      db.from("checklist_items").select("id, code, category, content, responsible_role, sort_order").eq("active", 1).order("sort_order"),
    ]);
    for (const result of results) if (result.error) assertDatabase(null, result.error);
    const [groups, groupBuses, users, userBuses, checklistItems] = results.map((result) => result.data);
    return Response.json({ groups, groupBuses, users, userBuses, checklistItems });
  }

  const results = await Promise.all([
    db.from("school_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("buses").select("*").eq("active", 1).order("bus_number"),
    db.from("students").select("*").eq("active", 1).order("grade").order("class_name").order("name"),
    db.from("assignments").select("*").order("start_date", { ascending: false }),
    db.from("calendar_exclusions").select("*").order("date"),
  ]);
  for (const result of results) if (result.error) assertDatabase(null, result.error);
  const [settings, buses, students, assignments, exclusions] = results.map((result) => result.data);

  if (user.demo) {
    const samplePeople = [
      { id: 9001, name: "김도윤", grade: 1, class_name: "2반", active: 1 },
      { id: 9002, name: "박서연", grade: 1, class_name: "3반", active: 1 },
      { id: 9003, name: "이준우", grade: 2, class_name: "1반", active: 1 },
      { id: 9004, name: "정하윤", grade: 2, class_name: "2반", active: 1 },
      { id: 9005, name: "최지안", grade: 3, class_name: "1반", active: 1 },
    ];
    const stopNames = ["은빛마을 정류장", "중앙공원 앞", "한솔아파트", "중앙공원 앞", "은빛마을 정류장"];
    const sampleAssignments = samplePeople.map((student, index) => ({
      id: 9100 + index,
      student_id: student.id,
      bus_id: Number((buses as Array<{ id: number }>)[index < 3 ? 0 : 1]?.id ?? 1),
      stop_name: stopNames[index],
      start_date: "2026-03-02",
      end_date: "2027-02-28",
    }));
    const plates = ["78가 1234", "71나 5682", "75다 3409", "73라 8261"];
    const drivers = ["김민수", "박서준", "이정희", "최준호"];
    const demoBuses = (buses as Array<Record<string, unknown>>).map((bus, index) => index < 4 ? { ...bus, plate_number: plates[index], driver_name: drivers[index], attendant_name: `${["한지우", "윤서아", "오하린", "문예린"][index]}` } : bus);
    return Response.json({
      settings,
      buses: demoBuses,
      students: samplePeople,
      assignments: sampleAssignments,
      exclusions,
      groups: [],
      groupBuses: [],
      users: [{ id: 0, username: "demo", display_name: "체험 관리자", role: "admin", active: 1 }],
      userBuses: [],
      checklistItems: [],
      demo: true,
    });
  }

  if (user.role === "admin") {
    return Response.json({ settings, buses, students, assignments, exclusions, groups: [], groupBuses: [], users: [], userBuses: [], checklistItems: [] });
  }
  const { data: userBuses, error: userBusesError } = await db.from("user_bus_assignments").select("user_id, bus_id").eq("user_id", user.id);
  if (userBusesError) assertDatabase(null, userBusesError);
  const allowed = Array.from(new Set((userBuses as Array<{ user_id: number; bus_id: number }>).map((item) => item.bus_id)));
  const visibleAssignments = (assignments as Array<{ id: number; student_id: number; bus_id: number }>).filter((item) => allowed.includes(item.bus_id));
  const visibleStudentIds = visibleAssignments.map((item) => item.student_id);
  return Response.json({
    settings,
    buses: (buses as Array<{ id: number }>).filter((item) => allowed.includes(item.id)),
    students: (students as Array<{ id: number }>).filter((item) => visibleStudentIds.includes(item.id)),
    assignments: visibleAssignments,
    exclusions,
    groups: [],
    groupBuses: [],
    users: [],
    userBuses: [],
    checklistItems: [],
  });
}

export async function POST(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  if (user.demo) return jsonError("체험 모드에서는 실제 데이터를 저장하지 않습니다.", 403);
  const db = await ensureDatabase();
  const body = await request.json() as DataAction;

  if (body.action === "saveBus") {
    if (!Number.isInteger(body.id)) return jsonError("차량 정보가 올바르지 않습니다.");
    const { error } = await db.from("buses").update({
      plate_number: body.plateNumber?.trim() || null,
      driver_name: body.driverName?.trim() || null,
      attendant_name: body.attendantName?.trim() || null,
    }).eq("id", body.id);
    if (error) assertDatabase(null, error);
  } else if (body.action === "addStudent") {
    if (!body.name?.trim() || !Number.isInteger(body.grade) || !body.className?.trim()) return jsonError("학생 이름, 학년, 반을 모두 입력하세요.");
    const { error } = await db.from("students").insert({ name: body.name.trim(), grade: body.grade, class_name: body.className.trim() });
    if (error) assertDatabase(null, error);
  } else if (body.action === "updateStudent") {
    if (!body.id || !body.name?.trim() || !Number.isInteger(body.grade) || !body.className?.trim()) return jsonError("학생 이름, 학년, 반을 모두 입력하세요.");
    const { error } = await db.from("students").update({ name: body.name.trim(), grade: body.grade, class_name: body.className.trim() }).eq("id", body.id);
    if (error) assertDatabase(null, error);
    if (body.assignmentId) {
      const { error: assignmentError } = await db.from("assignments").update({ stop_name: body.stopName?.trim() || null }).eq("id", body.assignmentId).eq("student_id", body.id);
      if (assignmentError) assertDatabase(null, assignmentError, "승차장소를 수정하지 못했습니다.");
    }
  } else if (body.action === "addStudentAndAssign") {
    if (!body.name?.trim() || !Number.isInteger(body.grade) || !body.className?.trim() || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생 정보와 차량 배정 기간을 확인하세요.");
    const { data: inserted, error: studentError } = await db.from("students")
      .insert({ name: body.name.trim(), grade: body.grade, class_name: body.className.trim() }).select("id").single();
    const student = assertDatabase(inserted, studentError);
    const { error } = await db.from("assignments").insert({ student_id: student.id, bus_id: body.busId, stop_name: body.stopName?.trim() || null, start_date: body.startDate, end_date: body.endDate });
    if (error) assertDatabase(null, error);
  } else if (body.action === "saveAssignment") {
    if (!body.studentId || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생 배정 기간을 확인하세요.");
    const { data: overlap, error: overlapError } = await db.from("assignments").select("id")
      .eq("student_id", body.studentId).lte("start_date", body.endDate).gte("end_date", body.startDate).limit(1).maybeSingle();
    if (overlapError) assertDatabase(null, overlapError);
    if (overlap) return jsonError("이 학생은 해당 기간에 이미 다른 차량에 배정되어 있습니다.");
    const { error } = await db.from("assignments").insert({ student_id: body.studentId, bus_id: body.busId, stop_name: body.stopName?.trim() || null, start_date: body.startDate, end_date: body.endDate });
    if (error) assertDatabase(null, error);
  } else if (body.action === "reassignStudent") {
    if (!body.studentId || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("학생과 새 배정 기간을 확인하세요.");
    const { data: overlapping, error: overlapError } = await db.from("assignments").select("id")
      .eq("student_id", body.studentId).lte("start_date", body.endDate).gte("end_date", body.startDate)
      .order("start_date", { ascending: false }).limit(1).maybeSingle();
    if (overlapError) assertDatabase(null, overlapError);
    if (overlapping) {
      const { error } = await db.from("assignments").update({ bus_id: body.busId, stop_name: body.stopName?.trim() || null, start_date: body.startDate, end_date: body.endDate }).eq("id", overlapping.id);
      if (error) assertDatabase(null, error);
    } else {
      const { error } = await db.from("assignments").insert({ student_id: body.studentId, bus_id: body.busId, stop_name: body.stopName?.trim() || null, start_date: body.startDate, end_date: body.endDate });
      if (error) assertDatabase(null, error);
    }
  } else if (body.action === "deleteAssignment") {
    if (!Number.isInteger(body.assignmentId) || body.assignmentId <= 0) return jsonError("삭제할 학생 배정 정보가 올바르지 않습니다.");
    const { data, error } = await db.from("assignments").delete().eq("id", body.assignmentId).select("id").maybeSingle();
    if (error) assertDatabase(null, error, "학생 차량 배정을 삭제하지 못했습니다.");
    if (!data) return jsonError("이미 삭제되었거나 찾을 수 없는 학생 배정입니다.", 404);
  } else if (body.action === "moveAssignment") {
    if (!Number.isInteger(body.assignmentId) || body.assignmentId <= 0 || !Number.isInteger(body.busId) || body.busId <= 0) return jsonError("학생 배정 이동 정보가 올바르지 않습니다.");
    const { data, error } = await db.from("assignments").update({ bus_id: body.busId }).eq("id", body.assignmentId).select("id").maybeSingle();
    if (error) assertDatabase(null, error, "학생 차량 배정을 옮기지 못했습니다.");
    if (!data) return jsonError("이미 삭제되었거나 찾을 수 없는 학생 배정입니다.", 404);
  } else if (body.action === "deleteBusAssignments") {
    if (!Number.isInteger(body.busId) || body.busId <= 0) return jsonError("삭제할 호차 정보가 올바르지 않습니다.");
    const { error } = await db.from("assignments").delete().eq("bus_id", body.busId);
    if (error) assertDatabase(null, error, "호차 학생 배정을 삭제하지 못했습니다.");
  } else if (body.action === "deleteAllStudents") {
    const { error: assignmentsError } = await db.from("assignments").delete().gt("id", 0);
    if (assignmentsError) assertDatabase(null, assignmentsError, "학생 배정을 삭제하지 못했습니다.");
    const { error: studentsError } = await db.from("students").update({ active: 0 }).eq("active", 1);
    if (studentsError) assertDatabase(null, studentsError, "학생 명단을 삭제하지 못했습니다.");
  } else if (body.action === "addExclusion") {
    if (!body.date) return jsonError("제외 날짜를 입력하세요.");
    const { error } = await db.from("calendar_exclusions").upsert({ date: body.date, kind: body.kind, note: body.note?.trim() || null }, { onConflict: "date" });
    if (error) assertDatabase(null, error);
  } else if (body.action === "deleteExclusion") {
    const { error } = await db.from("calendar_exclusions").delete().eq("id", body.id);
    if (error) assertDatabase(null, error);
  } else if (body.action === "saveGroupBuses") {
    if (!body.groupId || !Array.isArray(body.busIds) || body.busIds.length === 0) return jsonError("점검 세트에 한 대 이상의 차량을 선택하세요.");
    const firstDelete = await db.from("inspection_group_buses").delete().eq("group_id", body.groupId);
    if (firstDelete.error) assertDatabase(null, firstDelete.error);
    const otherDelete = await db.from("inspection_group_buses").delete().neq("group_id", body.groupId).in("bus_id", body.busIds);
    if (otherDelete.error) assertDatabase(null, otherDelete.error);
    const { error } = await db.from("inspection_group_buses").insert(body.busIds.map((busId) => ({ group_id: body.groupId, bus_id: busId })));
    if (error) assertDatabase(null, error);
  } else if (body.action === "addGroup") {
    if (!body.name?.trim()) return jsonError("점검 세트 이름을 입력하세요.");
    const { error } = await db.from("inspection_groups").insert({ name: body.name.trim() });
    if (error) assertDatabase(null, error);
  } else if (body.action === "deleteGroup") {
    const { count, error: countError } = await db.from("inspection_groups").select("id", { count: "exact", head: true }).eq("active", 1);
    if (countError) assertDatabase(null, countError);
    if ((count ?? 0) <= 1) return jsonError("점검 세트는 한 개 이상 필요합니다.");
    const mappingDelete = await db.from("inspection_group_buses").delete().eq("group_id", body.groupId);
    if (mappingDelete.error) assertDatabase(null, mappingDelete.error);
    const { error } = await db.from("inspection_groups").update({ active: 0 }).eq("id", body.groupId);
    if (error) assertDatabase(null, error);
  } else if (body.action === "updateChecklistItem") {
    if (!body.id || !body.content?.trim() || !["all", "driver", "attendant"].includes(body.responsibleRole)) return jsonError("점검 문구와 담당 역할을 확인하세요.");
    const { error } = await db.from("checklist_items").update({ content: body.content.trim(), responsible_role: body.responsibleRole }).eq("id", body.id);
    if (error) assertDatabase(null, error);
  } else if (body.action === "issueOperationCode") {
    if (!body.displayName?.trim() || !["driver", "attendant"].includes(body.role) || !body.busId || !body.startDate || !body.endDate || body.startDate > body.endDate) return jsonError("운행 코드 발급 정보를 확인하세요.");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let issuedCode = "";
    let createdUser: { id: number } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const random = crypto.getRandomValues(new Uint8Array(8));
      const code = `BUS-${Array.from(random, (item) => alphabet[item % alphabet.length]).join("")}`;
      const internalPin = await createPinHash(Array.from(crypto.getRandomValues(new Uint8Array(8)), (item) => (item % 10).toString()).join(""));
      const { data, error } = await db.from("app_users").insert({
        username: code,
        display_name: body.displayName.trim(),
        role: body.role,
        pin_salt: internalPin.salt,
        pin_hash: internalPin.hash,
        active: 1,
      }).select("id").single();
      if (!error && data) {
        issuedCode = code;
        createdUser = data;
        break;
      }
      if (error?.code !== "23505") assertDatabase(null, error, "운행 코드를 발급하지 못했습니다.");
    }
    if (!createdUser) return jsonError("운행 코드 발급을 다시 시도하세요.", 500);
    const { error } = await db.from("user_bus_assignments").insert({ user_id: createdUser.id, bus_id: body.busId, start_date: body.startDate, end_date: body.endDate });
    if (error) {
      await db.from("app_users").delete().eq("id", createdUser.id);
      assertDatabase(null, error);
    }
    return Response.json({ ok: true, code: issuedCode });
  } else if (body.action === "saveSettings") {
    if (!body.startDate || !body.endDate || body.startDate > body.endDate || !body.semester1StartDate || !body.semester1EndDate || !body.semester2StartDate || !body.semester2EndDate || body.semester1StartDate > body.semester1EndDate || body.semester2StartDate > body.semester2EndDate) return jsonError("운행 기간과 학기 기간을 확인하세요.");
    const { error } = await db.from("school_settings").update({
      school_year: body.schoolYear,
      start_date: body.startDate,
      end_date: body.endDate,
      semester1_start_date: body.semester1StartDate,
      semester1_end_date: body.semester1EndDate,
      semester2_start_date: body.semester2StartDate,
      semester2_end_date: body.semester2EndDate,
      include_labor_day: body.includeLaborDay ? 1 : 0,
      include_election_day: body.includeElectionDay ? 1 : 0,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (error) assertDatabase(null, error);
  } else {
    return jsonError("지원하지 않는 작업입니다.");
  }
  return Response.json({ ok: true });
}
