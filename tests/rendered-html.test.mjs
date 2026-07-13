import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getHolidayPreset } from "@hyunbinseo/holidays-kr";
import { maskName, maskPlate } from "../app/masking.ts";

const root = new URL("../", import.meta.url);

test("통학버스 관리 화면과 Supabase 서버 연결이 포함되어 있다", async () => {
  const [page, layout, runtime, migration] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("db/runtime.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260713074934_schoolbus_schema.sql", root), "utf8"),
  ]);
  assert.match(layout, /와석초등 통학버스 관리 플랫폼/);
  assert.match(page, /오늘의 운행일지/);
  assert.match(page, /등교 탑승 명단/);
  assert.match(page, /미운행 통계/);
  assert.match(page, /안전 점검 체크리스트/);
  assert.doesNotMatch(page, /하교/);
  assert.match(runtime, /@supabase\/supabase-js/);
  assert.match(runtime, /SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(runtime, /NEXT_PUBLIC_SUPABASE_SECRET_KEY/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /generate_series\(1, 18\)/);
});

test("기간이 겹치는 학생 중복 차량 배정을 차단한다", async () => {
  const [route, migration] = await Promise.all([
    readFile(new URL("app/api/data/route.ts", root), "utf8"),
    readFile(new URL("supabase/migrations/20260713074934_schoolbus_schema.sql", root), "utf8"),
  ]);
  assert.match(route, /\.lte\("start_date", body\.endDate\)/);
  assert.match(route, /\.gte\("end_date", body\.startDate\)/);
  assert.match(route, /이미 다른 차량에 배정/);
  assert.match(migration, /exclude using gist/);
  assert.match(migration, /daterange\(start_date, end_date, '\[\]'\) with &&/);
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
  const [auth, runs, data, page, demo] = await Promise.all([
    readFile(new URL("app/auth.ts", root), "utf8"),
    readFile(new URL("app/api/runs/route.ts", root), "utf8"),
    readFile(new URL("app/api/data/route.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/demo/route.ts", root), "utf8"),
  ]);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /iterations: 120_000/);
  assert.match(auth, /HttpOnly/);
  assert.match(runs, /canAccessBus/);
  assert.match(data, /requireUser\(request, \["admin"\]\)/);
  assert.match(page, /샘플 데이터로 체험하기/);
  assert.match(demo, /demoSessionCookie/);
  assert.match(data, /체험 모드에서는 실제 데이터를 저장하지 않습니다/);
  assert.match(runs, /체험 모드에서는 실제 운행일지를 저장하지 않습니다/);
});
test("관리자가 차량별 운행 코드를 발급하고 운행 담당자가 코드로 입장한다", async () => {
  const [page, data, login, operation] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/data/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/login/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/operation/route.ts", root), "utf8"),
  ]);
  assert.match(page, /버스 운행/);
  assert.match(page, /버스 운행 코드 발급/);
  assert.match(data, /issueOperationCode/);
  assert.match(data, /BUS-\$\{/);
  assert.match(login, /user\.role !== "admin"/);
  assert.match(operation, /\^BUS-\[A-Z2-9\]\{8\}\$/);
  assert.match(operation, /\["driver", "attendant"\]/);
});
