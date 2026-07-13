import { assertDatabase, ensureDatabase, jsonError } from "../../../../db/runtime";
import { requireUser } from "../../../auth";

function csv(value: string | number | null | undefined) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  const month = new URL(request.url).searchParams.get("month");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "")) return jsonError("조회 월 형식을 확인하세요.");
  const db = await ensureDatabase();
  const end = new Date(Date.UTC(Number(month!.slice(0, 4)), Number(month!.slice(5, 7)), 1)).toISOString().slice(0, 7);
  const { data, error } = await db.from("daily_runs").select("date,status,reason,bus:buses(bus_number),boarding:boarding_records(boarded,note,student:students(name,grade,class_name))").gte("date", `${month}-01`).lt("date", `${end}-01`).order("date");
  if (error) assertDatabase(null, error);
  const rows = ["운행일,호차,운행상태,미운행사유,학생명,학년,반,탑승여부,비고"];
  for (const run of data ?? []) {
    const bus = run.bus as unknown as { bus_number: number } | null;
    const boarding = run.boarding as unknown as Array<{ boarded: number; note: string | null; student: { name: string; grade: number; class_name: string } | null }>;
    if (!boarding.length) rows.push([run.date, `${bus?.bus_number ?? ""}호차`, run.status, run.reason ?? "", "", "", "", "", ""].map(csv).join(","));
    for (const item of boarding) rows.push([run.date, `${bus?.bus_number ?? ""}호차`, run.status, run.reason ?? "", item.student?.name, item.student?.grade, item.student?.class_name, item.boarded ? "탑승" : "미탑승", item.note].map(csv).join(","));
  }
  return new Response(`\uFEFF${rows.join("\r\n")}`, { headers: { "Content-Type": "text/csv;charset=utf-8", "Content-Disposition": `attachment; filename="${month}_운행일지.csv"` } });
}
