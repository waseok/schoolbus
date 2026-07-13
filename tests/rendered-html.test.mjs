import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getHolidayPreset } from "@hyunbinseo/holidays-kr";
import { maskName, maskPlate } from "../app/masking.ts";

const root = new URL("../", import.meta.url);

test("통학버스 관리 화면의 핵심 기능이 포함되어 있다", async () => {
  const [page, layout, hosting] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL(".openai/hosting.json", root), "utf8"),
  ]);
  assert.match(layout, /통학버스 안전일지/);
  assert.match(page, /오늘의 운행일지/);
  assert.match(page, /등교 탑승 명단/);
  assert.match(page, /월별 미운행 통계/);
  assert.match(page, /안전 점검 체크리스트/);
  assert.doesNotMatch(page, /하교/);
  assert.equal(JSON.parse(hosting).d1, "DB");
});

test("기간이 겹치는 학생 중복 차량 배정을 차단한다", async () => {
  const route = await readFile(new URL("app/api/data/route.ts", root), "utf8");
  assert.match(route, /start_date <= \?/);
  assert.match(route, /end_date >= \?/);
  assert.match(route, /이미 다른 차량에 배정/);
});

test("한국 공휴일 자료에 다일 명절과 대체공휴일이 포함된다", async () => {
  const preset = await getHolidayPreset("2026");
  const dates = Object.keys(preset);
  assert.ok(dates.includes("2026-02-16"));
  assert.ok(dates.includes("2026-02-17"));
  assert.ok(dates.includes("2026-02-18"));
  assert.ok(dates.includes("2026-03-02"));
  assert.ok(dates.includes("2026-07-17"));
});

test("차량번호와 운전자 성명의 가운데 부분을 가린다", () => {
  assert.equal(maskName("김민수"), "김*수");
  assert.equal(maskName("박서준호"), "박**호");
  assert.equal(maskPlate("78가 1234"), "78가**34");
});

test("간편 비밀번호와 담당 차량 권한을 서버에서 검사한다", async () => {
  const [auth, runs, data] = await Promise.all([
    readFile(new URL("app/auth.ts", root), "utf8"),
    readFile(new URL("app/api/runs/route.ts", root), "utf8"),
    readFile(new URL("app/api/data/route.ts", root), "utf8"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /iterations: 120_000/);
  assert.match(auth, /HttpOnly/);
  assert.match(runs, /canAccessBus/);
  assert.match(data, /requireUser\(request, \["admin"\]\)/);
});
