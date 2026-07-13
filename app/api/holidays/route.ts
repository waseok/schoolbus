import { getHolidayPreset } from "@hyunbinseo/holidays-kr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const year = url.searchParams.get("year") ?? String(new Date().getFullYear());

  if (!/^20\d{2}$/.test(year)) {
    return Response.json({ error: "연도 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const preset = await getHolidayPreset(year);
    const holidays = Object.entries(preset).map(([date, names]) => ({ date, names }));
    return Response.json({ year: Number(year), holidays });
  } catch {
    return Response.json({ error: `${year}년 공휴일 자료가 아직 제공되지 않았습니다.` }, { status: 404 });
  }
}
