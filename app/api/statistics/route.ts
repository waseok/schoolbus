import { getHolidayPreset } from "@hyunbinseo/holidays-kr";
import { ensureDatabase, jsonError } from "../../../db/runtime";
import { requireUser } from "../../auth";

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "")) return jsonError("조회 월 형식이 올바르지 않습니다.");
  const db = await ensureDatabase();
  const year = month!.slice(0, 4);
  const [holidayPreset, exclusions, runs, buses, settings] = await Promise.all([
    getHolidayPreset(year),
    db.prepare("SELECT date, kind, note FROM calendar_exclusions WHERE date LIKE ? ORDER BY date").bind(`${month}%`).all(),
    db.prepare("SELECT bus_id, date, status, reason FROM daily_runs WHERE date LIKE ? AND status = 'not_operated' ORDER BY bus_id, date").bind(`${month}%`).all(),
    db.prepare("SELECT id, bus_number FROM buses WHERE active = 1 ORDER BY bus_number").all(),
    db.prepare("SELECT include_labor_day, include_election_day FROM school_settings WHERE id = 1").first<{ include_labor_day: number; include_election_day: number }>(),
  ]);
  const holidays = Object.entries(holidayPreset)
    .filter(([date, names]) => date.startsWith(month!) && (settings?.include_labor_day || !names.some((name) => name.includes("노동절"))) && (settings?.include_election_day || !names.some((name) => name.includes("선거"))))
    .map(([date, names]) => ({ date, names }));
  return Response.json({ month, holidays, exclusions: exclusions.results, nonOperatingRuns: runs.results, buses: buses.results, criterion: "morning_only_including_holidays" });
}
