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
  const { data, error } = await db.from("boarding_records")
    .select("note, student:students(name, grade, class_name), run:daily_runs!inner(date, bus:buses(bus_number))")
    .eq("boarded", 0)
    .gte("run.date", `${month}-01`)
    .lt("run.date", `${end}-01`)
    .order("id");
  if (error) assertDatabase(null, error);
  const records = (data ?? []).flatMap((item) => {
    const student = item.student as unknown as { name: string; grade: number; class_name: string } | null;
    const run = item.run as unknown as { date: string; bus: { bus_number: number } | null } | null;
    return student && run?.bus ? [{ name: student.name, grade: student.grade, className: student.class_name, date: run.date, busNumber: run.bus.bus_number, note: item.note ?? "사유 미기록" }] : [];
  });
  return Response.json({ month, records });
}
