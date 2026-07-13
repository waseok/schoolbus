import { getHolidayPreset } from "@hyunbinseo/holidays-kr";
import { assertDatabase, ensureDatabase, jsonError } from "../../../db/runtime";
import { requireUser } from "../../auth";

function nextMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value, 1));
  return date.toISOString().slice(0, 7);
}

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month ?? "")) return jsonError("조회 월 형식이 올바르지 않습니다.");
  const db = await ensureDatabase();
  const year = month!.slice(0, 4);
  const end = nextMonth(month!);
  const [holidayPreset, exclusionsResult, runsResult, busesResult, settingsResult] = await Promise.all([
    getHolidayPreset(year),
    db.from("calendar_exclusions").select("date, kind, note").gte("date", `${month}-01`).lt("date", `${end}-01`).order("date"),
    db.from("daily_runs").select("bus_id, date, status, reason").gte("date", `${month}-01`).lt("date", `${end}-01`).eq("status", "not_operated").order("bus_id").order("date"),
    db.from("buses").select("id, bus_number").eq("active", 1).order("bus_number"),
    db.from("school_settings").select("include_labor_day, include_election_day").eq("id", 1).maybeSingle(),
  ]);
  for (const result of [exclusionsResult, runsResult, busesResult, settingsResult]) if (result.error) assertDatabase(null, result.error);
  const settings = settingsResult.data;
  const holidays = Object.entries(holidayPreset)
    .filter(([date, names]) => date.startsWith(month!) && (settings?.include_labor_day || !names.some((name) => name.includes("노동절"))) && (settings?.include_election_day || !names.some((name) => name.includes("선거"))))
    .map(([date, names]) => ({ date, names }));
  return Response.json({ month, holidays, exclusions: exclusionsResult.data, nonOperatingRuns: runsResult.data, buses: busesResult.data, criterion: "morning_only_including_holidays" });
}
