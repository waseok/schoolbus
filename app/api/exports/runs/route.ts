import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";
import { requireUser } from "../../../auth";

function csv(value: string | number | null | undefined) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);

  const month = new URL(request.url).searchParams.get("month");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "")) return jsonError("조회 월 형식을 확인하세요.");

  const db = await ensureDatabase();
  const year = Number(month!.slice(0, 4));
  const nextMonth = Number(month!.slice(5, 7));
  const end = new Date(Date.UTC(year, nextMonth, 1)).toISOString().slice(0, 10);
  const { data: runs, error: runsError } = await db
    .from("daily_runs")
    .select("id,date,status,reason,bus_id")
    .gte("date", `${month}-01`)
    .lt("date", end)
    .order("date");
  if (runsError) assertDatabase(null, runsError);

  const runIds = (runs ?? []).map((run) => run.id);
  const busIds = [...new Set((runs ?? []).map((run) => run.bus_id))];
  const [{ data: buses, error: busesError }, { data: boardings, error: boardingsError }] = await Promise.all([
    busIds.length ? db.from("buses").select("id,bus_number").in("id", busIds) : Promise.resolve({ data: [], error: null }),
    runIds.length ? db.from("boarding_records").select("daily_run_id,student_id,boarded,note").in("daily_run_id", runIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (busesError) assertDatabase(null, busesError);
  if (boardingsError) assertDatabase(null, boardingsError);

  const studentIds = [...new Set((boardings ?? []).map((boarding) => boarding.student_id))];
  const { data: students, error: studentsError } = studentIds.length
    ? await db.from("students").select("id,name,grade,class_name").in("id", studentIds)
    : { data: [], error: null };
  if (studentsError) assertDatabase(null, studentsError);

  const busById = new Map((buses ?? []).map((bus) => [bus.id, bus]));
  const studentById = new Map((students ?? []).map((student) => [student.id, student]));
  const boardingsByRun = new Map<number, typeof boardings>();
  for (const boarding of boardings ?? []) {
    const items = boardingsByRun.get(boarding.daily_run_id) ?? [];
    items.push(boarding);
    boardingsByRun.set(boarding.daily_run_id, items);
  }

  const rows = ["운행일,호차,운행상태,미운행사유,학생명,학년,반,탑승여부,비고"];
  for (const run of runs ?? []) {
    const bus = busById.get(run.bus_id);
    const runBoardings = boardingsByRun.get(run.id) ?? [];
    if (!runBoardings.length) {
      rows.push([run.date, `${bus?.bus_number ?? ""}호차`, run.status, run.reason, "", "", "", "", ""].map(csv).join(","));
      continue;
    }
    for (const boarding of runBoardings) {
      const student = studentById.get(boarding.student_id);
      rows.push([run.date, `${bus?.bus_number ?? ""}호차`, run.status, run.reason, student?.name, student?.grade, student?.class_name, boarding.boarded ? "탑승" : "미탑승", boarding.note].map(csv).join(","));
    }
  }

  return new Response(`\uFEFF${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="schoolbus-runs-${month}.csv"`,
    },
  });
}
