import { assertDatabase, ensureDatabase, jsonError } from "../../../db/runtime";
import { requireUser } from "../../auth";

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 7);
}

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  const month = new URL(request.url).searchParams.get("month");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "")) return jsonError("조회 월 형식을 확인하세요.");

  const db = await ensureDatabase();
  const end = nextMonth(month!);
  const { data: runs, error: runsError } = await db.from("daily_runs")
    .select("id,date,bus_id")
    .gte("date", `${month}-01`)
    .lt("date", `${end}-01`);
  if (runsError) assertDatabase(null, runsError);
  const runIds = (runs ?? []).map((run) => run.id);
  if (!runIds.length) return Response.json({ month, records: [] });

  const { data: boardings, error: boardingError } = await db.from("boarding_records")
    .select("daily_run_id,student_id,note")
    .eq("boarded", 0)
    .in("daily_run_id", runIds);
  if (boardingError) assertDatabase(null, boardingError);
  const studentIds = [...new Set((boardings ?? []).map((boarding) => boarding.student_id))];
  const busIds = [...new Set((runs ?? []).map((run) => run.bus_id))];
  const [{ data: students, error: studentsError }, { data: buses, error: busesError }] = await Promise.all([
    studentIds.length ? db.from("students").select("id,name,grade,class_name").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
    busIds.length ? db.from("buses").select("id,bus_number").in("id", busIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (studentsError) assertDatabase(null, studentsError);
  if (busesError) assertDatabase(null, busesError);

  const runById = new Map((runs ?? []).map((run) => [run.id, run]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const busById = new Map((buses ?? []).map((bus) => [bus.id, bus]));
  const records = (boardings ?? []).flatMap((boarding) => {
    const run = runById.get(boarding.daily_run_id);
    const student = studentById.get(boarding.student_id);
    const bus = run ? busById.get(run.bus_id) : null;
    return run && student && bus ? [{ name: student.name, grade: student.grade, className: student.class_name, date: run.date, busNumber: bus.bus_number, note: boarding.note ?? "미탑승" }] : [];
  });
  return Response.json({ month, records });
}
