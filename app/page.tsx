"use client";

import { useEffect, useMemo, useState } from "react";
import { maskName, maskPlate } from "./masking";
import { defaultChecklistItems } from "../lib/checklist";

type View = "log" | "stats" | "checklist" | "settings";
type EntryMode = "choose" | "admin" | "operation";
type SignedInUser = { id: number; username: string; display_name: string | null; role: "admin" | "driver" | "attendant"; demo?: boolean };
type ApiBus = { id: number; bus_number: number; plate_number: string | null; driver_name: string | null; attendant_name: string | null };
type ApiStudent = { id: number; name: string; grade: number; class_name: string };
type ApiAssignment = { id: number; student_id: number; bus_id: number; stop_name: string | null; start_date: string; end_date: string };
type ApiGroup = { id: number; name: string };
type ApiChecklistItem = { id: number; code: string; category: string; content: string; responsible_role: "all" | "driver" | "attendant"; sort_order: number };
type ApiUser = { id: number; username: string; display_name: string | null; role: "admin" | "driver" | "attendant"; active: number };
type ApiUserBus = { id: number; user_id: number; bus_id: number; start_date: string; end_date: string };
type SchoolData = { settings: Record<string, unknown> | null; buses: ApiBus[]; students: ApiStudent[]; assignments: ApiAssignment[]; exclusions: Array<{ id: number; date: string; kind: string; note: string | null }>; groups: ApiGroup[]; groupBuses: Array<{ group_id: number; bus_id: number }>; users: ApiUser[]; userBuses: ApiUserBus[]; checklistItems: ApiChecklistItem[] };
type StatisticsData = { month: string; holidays: Array<{ date: string; names: string[] }>; exclusions: Array<{ date: string; kind: string; note: string | null }>; nonOperatingRuns: Array<{ bus_id: number; date: string; reason: string | null }>; buses: Array<{ id: number; bus_number: number }> };

const buses = [
  { id: 1, label: "1호차", plate: "78가 **34", driver: "김*수", students: 22 },
  { id: 2, label: "2호차", plate: "71나 **82", driver: "박*준", students: 18 },
  { id: 3, label: "3호차", plate: "75다 **09", driver: "이*희", students: 20 },
  { id: 4, label: "4호차", plate: "73라 **61", driver: "최*호", students: 16 },
];

const initialStudents = [
  { id: 1, name: "김도윤", detail: "1학년 2반 · 은빛마을 정류장", boarded: true, note: "" },
  { id: 2, name: "박서연", detail: "1학년 3반 · 중앙공원 앞", boarded: true, note: "" },
  { id: 3, name: "이준우", detail: "2학년 1반 · 한솔아파트", boarded: false, note: "병원 진료" },
  { id: 4, name: "정하윤", detail: "2학년 2반 · 중앙공원 앞", boarded: true, note: "" },
  { id: 5, name: "최지안", detail: "3학년 1반 · 은빛마을 정류장", boarded: true, note: "" },
];

function NavButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button className={active ? "nav-button active" : "nav-button"} onClick={onClick}>{children}</button>;
}

function koreanDate(date: string) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

export default function Home() {
  const [authUser, setAuthUser] = useState<SignedInUser | null | undefined>(undefined);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [authForm, setAuthForm] = useState({ username: "", pin: "", displayName: "" });
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode>("choose");
  const [operationCode, setOperationCode] = useState("");
  const [view, setView] = useState<View>("log");
  const [busId, setBusId] = useState(1);
  const [liveBuses, setLiveBuses] = useState(buses);
  const [schoolData, setSchoolData] = useState<SchoolData | null>(null);
  const [dataMessage, setDataMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState("2026-07-13");
  const [students, setStudents] = useState(initialStudents);
  const [answers, setAnswers] = useState<Record<string, "예" | "아니요" | "해당없음">>({});
  const [statisticsMonth, setStatisticsMonth] = useState("2026-07");
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [inspectionMonth, setInspectionMonth] = useState("2026-07");
  const [inspectionGroupId, setInspectionGroupId] = useState<number | null>(null);
  const [settingsBusId, setSettingsBusId] = useState(1);
  const [busForm, setBusForm] = useState({ plateNumber: "", driverName: "", attendantName: "" });
  const [studentForm, setStudentForm] = useState({ name: "", grade: 1, className: "1반", busId: 1, stopName: "", startDate: "2026-03-02", endDate: "2027-02-28" });
  const [reassignForm, setReassignForm] = useState({ studentId: 0, busId: 1, stopName: "", startDate: "2026-03-02", endDate: "2027-02-28" });
  const [exclusionForm, setExclusionForm] = useState({ date: "", note: "재량휴업일" });
  const [accountForm, setAccountForm] = useState({ displayName: "", role: "driver" as "driver" | "attendant", busId: 1, startDate: "2026-03-02", endDate: "2027-02-28" });
  const [groupForm, setGroupForm] = useState({ name: "새 점검 세트", groupId: 0, busIds: [] as number[] });
  const [settingsForm, setSettingsForm] = useState({ schoolYear: 2026, startDate: "2026-03-02", endDate: "2027-02-28", includeLaborDay: true, includeElectionDay: true });
  const [checklistDrafts, setChecklistDrafts] = useState<Record<number, { content: string; responsibleRole: "all" | "driver" | "attendant" }>>({});
  const [holidays, setHolidays] = useState<Array<{ date: string; names: string[] }>>([]);
  const [saved, setSaved] = useState(false);
  const [runStatus, setRunStatus] = useState<"operated" | "not_operated">("operated");
  const [runReason, setRunReason] = useState("");
  const selectedBus = liveBuses.find((bus) => bus.id === busId) ?? liveBuses[0] ?? buses[0];
  const boardedCount = useMemo(() => students.filter((student) => student.boarded).length, [students]);
  const holiday = holidays.find((item) => item.date === selectedDate);
  const calendarExclusion = schoolData?.exclusions.find((item) => item.date === selectedDate);
  const excludedReason = holiday?.names.join(", ") ?? calendarExclusion?.note ?? null;
  const nextHoliday = holidays.find((item) => item.date > selectedDate);
  const statisticRows = useMemo(() => {
    if (!statistics) return [];
    const common = [...statistics.holidays.map((item) => ({ date: item.date, reason: item.names.join(", ") })), ...statistics.exclusions.map((item) => ({ date: item.date, reason: item.note || "학교 제외일" }))];
    return statistics.buses.map((bus) => {
      const individual = statistics.nonOperatingRuns.filter((run) => run.bus_id === bus.id).map((run) => ({ date: run.date, reason: run.reason || "미운행 기록" }));
      const unique = new Map([...common, ...individual].map((item) => [item.date, item]));
      return { bus: `${bus.bus_number}호차`, dates: Array.from(unique.values()).sort((a, b) => a.date.localeCompare(b.date)) };
    });
  }, [statistics]);
  const checklistItems = useMemo<ApiChecklistItem[]>(() => schoolData?.checklistItems?.length ? schoolData.checklistItems : defaultChecklistItems.map((item, index) => ({ id: -(index + 1), code: item.code, category: item.category, content: item.content, responsible_role: "all", sort_order: item.sortOrder })), [schoolData]);
  const inspectionGroups = useMemo(() => {
    const categories: Array<{ title: string; items: ApiChecklistItem[] }> = [];
    checklistItems.forEach((item) => {
      const group = categories.find((candidate) => candidate.title === item.category);
      if (group) group.items.push(item); else categories.push({ title: item.category, items: [item] });
    });
    return categories;
  }, [checklistItems]);

  useEffect(() => {
    const year = selectedDate.slice(0, 4);
    fetch(`/api/holidays?year=${year}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { holidays: Array<{ date: string; names: string[] }> }) => setHolidays(data.holidays))
      .catch(() => setHolidays([]));
  }, [selectedDate]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ data }: { data: { user: SignedInUser | null; needsSetup: boolean } }) => { setAuthUser(data.user); setNeedsSetup(data.needsSetup); })
      .catch(() => { setAuthUser(null); setAuthError("로그인 상태를 확인하지 못했습니다."); });
  }, []);

  useEffect(() => {
    if (authUser) void loadSchoolData();
  }, [authUser]);

  useEffect(() => {
    if (!schoolData || !authUser) return;
    const activeAssignments = schoolData.assignments.filter((assignment) => assignment.bus_id === busId && assignment.start_date <= selectedDate && assignment.end_date >= selectedDate);
    const rows = activeAssignments.flatMap((assignment) => {
      const student = schoolData.students.find((item) => item.id === assignment.student_id);
      return student ? [{ id: student.id, name: student.name, detail: `${student.grade}학년 ${student.class_name} · ${assignment.stop_name || "정류장 미등록"}`, boarded: false, note: "" }] : [];
    });
    setStudents(rows);
    fetch(`/api/runs?busId=${busId}&date=${selectedDate}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { run: { status?: "operated" | "not_operated"; reason?: string | null } | null; boarding: Array<{ student_id: number; boarded: number; note: string | null }> }) => {
        setRunStatus(payload.run?.status ?? "operated");
        setRunReason(payload.run?.reason ?? "");
        setStudents((current) => current.map((student) => {
          const savedRecord = payload.boarding.find((record) => record.student_id === student.id);
          return savedRecord ? { ...student, boarded: Boolean(savedRecord.boarded), note: savedRecord.note ?? "" } : student;
        }));
      })
      .catch(() => undefined);
  }, [schoolData, authUser, busId, selectedDate]);

  useEffect(() => {
    if (view === "stats" && authUser?.role === "admin") {
      fetch(`/api/statistics?month=${statisticsMonth}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: StatisticsData) => setStatistics(data)).catch(() => setDataMessage("월별 통계를 불러오지 못했습니다."));
    }
  }, [view, statisticsMonth, authUser]);

  useEffect(() => {
    if (!inspectionGroupId && schoolData?.groups.length) setInspectionGroupId(schoolData.groups[0].id);
  }, [schoolData, inspectionGroupId]);

  useEffect(() => {
    const raw = schoolData?.buses.find((bus) => bus.id === settingsBusId);
    if (raw) setBusForm({ plateNumber: raw.plate_number ?? "", driverName: raw.driver_name ?? "", attendantName: raw.attendant_name ?? "" });
  }, [schoolData, settingsBusId]);

  useEffect(() => {
    if (!schoolData?.groups.length) return;
    const groupId = groupForm.groupId || schoolData.groups[0].id;
    setGroupForm((current) => ({ ...current, groupId, busIds: schoolData.groupBuses.filter((item) => item.group_id === groupId).map((item) => item.bus_id) }));
  }, [schoolData]);

  useEffect(() => {
    const settings = schoolData?.settings as { school_year?: number; start_date?: string; end_date?: string; include_labor_day?: number; include_election_day?: number } | null;
    if (settings) setSettingsForm({ schoolYear: settings.school_year ?? 2026, startDate: settings.start_date ?? "2026-03-02", endDate: settings.end_date ?? "2027-02-28", includeLaborDay: Boolean(settings.include_labor_day), includeElectionDay: Boolean(settings.include_election_day) });
  }, [schoolData]);

  useEffect(() => {
    if (!reassignForm.studentId && schoolData?.students.length) setReassignForm((current) => ({ ...current, studentId: schoolData.students[0].id }));
  }, [schoolData, reassignForm.studentId]);

  useEffect(() => {
    if (!schoolData?.checklistItems) return;
    setChecklistDrafts(Object.fromEntries(schoolData.checklistItems.map((item) => [item.id, { content: item.content, responsibleRole: item.responsible_role }])));
  }, [schoolData]);

  useEffect(() => {
    if (view !== "checklist" || !inspectionGroupId || !authUser) return;
    fetch(`/api/inspections?month=${inspectionMonth}&groupId=${inspectionGroupId}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { responses: Array<{ item_code: string; answer: "yes" | "no" | "not_applicable" }> }) => {
        const mapped: Record<string, "예" | "아니요" | "해당없음"> = {};
        data.responses.forEach((item) => { mapped[item.item_code] = item.answer === "yes" ? "예" : item.answer === "no" ? "아니요" : "해당없음"; });
        setAnswers(mapped);
      }).catch(() => setAnswers({}));
  }, [view, inspectionMonth, inspectionGroupId, authUser]);

  async function loadSchoolData() {
    const response = await fetch("/api/data");
    if (!response.ok) { setDataMessage("학교 데이터를 불러오지 못했습니다."); return; }
    const data = await response.json() as SchoolData;
    setSchoolData(data);
    const counts = new Map<number, number>();
    data.assignments.forEach((assignment) => counts.set(assignment.bus_id, (counts.get(assignment.bus_id) ?? 0) + 1));
    const mapped = data.buses.map((bus) => ({ id: bus.id, label: `${bus.bus_number}호차`, plate: maskPlate(bus.plate_number), driver: maskName(bus.driver_name), students: counts.get(bus.id) ?? 0 }));
    setLiveBuses(mapped);
    if (mapped.length && !mapped.some((bus) => bus.id === busId)) setBusId(mapped[0].id);
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const endpoint = needsSetup ? "/api/auth/setup" : "/api/auth/login";
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(authForm) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setAuthError(result.error ?? "로그인하지 못했습니다."); setAuthBusy(false); return; }
    const me = await fetch("/api/auth/me");
    const profile = await me.json() as { user: SignedInUser | null };
    setAuthUser(profile.user);
    setNeedsSetup(false);
    setAuthBusy(false);
  }

  async function submitOperationLogin(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const response = await fetch("/api/auth/operation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: operationCode }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setAuthError(result.error ?? "운행 코드로 로그인하지 못했습니다."); setAuthBusy(false); return; }
    const me = await fetch("/api/auth/me");
    const profile = await me.json() as { user: SignedInUser | null };
    setAuthUser(profile.user);
    setView("log");
    setAuthBusy(false);
  }

  async function enterDemo() {
    setAuthBusy(true);
    setAuthError("");
    const response = await fetch("/api/auth/demo", { method: "POST" });
    const result = await response.json() as { user?: SignedInUser; error?: string };
    if (!response.ok || !result.user) {
      setAuthError(result.error ?? "체험 모드를 시작하지 못했습니다.");
      setAuthBusy(false);
      return;
    }
    setAuthUser(result.user);
    setView("log");
    setAuthBusy(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setView("log");
    setEntryMode("choose");
    setOperationCode("");
  }

  async function saveRun() {
    if (excludedReason) return;
    setDataMessage("");
    const response = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ busId, date: selectedDate, status: runStatus, reason: runStatus === "not_operated" ? runReason : "", boarding: runStatus === "operated" ? students.map((student) => ({ studentId: student.id, boarded: student.boarded, note: student.note })) : [] }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setDataMessage(result.error ?? "운행일지를 저장하지 못했습니다."); return; }
    setSaved(true);
    setDataMessage("운행일지가 저장되었습니다.");
  }

  async function saveInspection(status: "draft" | "complete" = "draft") {
    if (!inspectionGroupId) return;
    const response = await fetch("/api/inspections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month: inspectionMonth, groupId: inspectionGroupId, status, answers: Object.entries(answers).map(([itemCode, answer]) => ({ itemCode, answer: answer === "예" ? "yes" : answer === "아니요" ? "no" : "not_applicable" })) }) });
    const result = await response.json() as { error?: string };
    setDataMessage(response.ok ? "안전 점검표가 저장되었습니다." : result.error ?? "점검표를 저장하지 못했습니다.");
  }

  async function adminAction(body: Record<string, unknown>, successMessage: string) {
    const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    setDataMessage(response.ok ? successMessage : result.error ?? "저장하지 못했습니다.");
    if (response.ok) await loadSchoolData();
    return response.ok;
  }

  async function issueOperationCode() {
    const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "issueOperationCode", ...accountForm }) });
    const result = await response.json() as { error?: string; code?: string };
    if (!response.ok) { setDataMessage(result.error ?? "운행 코드를 발급하지 못했습니다."); return; }
    setDataMessage(`운행 코드가 발급되었습니다: ${result.code} — 담당자에게 전달하세요.`);
    setAccountForm((current) => ({ ...current, displayName: "" }));
    await loadSchoolData();
  }

  function toggleBoarding(id: number) {
    setSaved(false);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, boarded: !student.boarded } : student));
  }

  function updateNote(id: number, note: string) {
    setSaved(false);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, note } : student));
  }

  if (authUser === undefined) return <main className="auth-screen"><div className="auth-card loading"><div className="brand-mark">안전</div><p>통학버스 안전일지를 준비하고 있습니다.</p></div></main>;

  if (!authUser) return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">안전</div><div><strong>통학버스 안전일지</strong><span>학교 등교버스 운행 관리</span></div></div>
        {entryMode === "choose" ? <>
          <div className="auth-copy"><span className="eyebrow">시작하기</span><h1>어떤 업무를 하시나요?</h1><p>관리자는 전체 설정과 기록을 관리하고, 운행 담당자는 배부받은 코드로 해당 차량의 일지를 작성합니다.</p></div>
          <div className="entry-choices">
            <button type="button" onClick={() => { setEntryMode("admin"); setAuthError(""); }}><strong>관리자</strong><span>차량·학생·점검과 운행 코드를 관리합니다.</span></button>
            <button type="button" onClick={() => { setEntryMode("operation"); setAuthError(""); }}><strong>버스 운행</strong><span>배부받은 코드로 운행일지를 작성합니다.</span></button>
          </div>
          <div className="demo-access"><span>계정을 만들기 전에 화면을 먼저 확인할 수 있습니다.</span><button type="button" onClick={enterDemo} disabled={authBusy}>샘플 데이터로 체험하기</button></div>
        </> : entryMode === "admin" ? <>
          <div className="auth-copy"><span className="eyebrow">{needsSetup ? "첫 관리자 설정" : "관리자 로그인"}</span><h1>{needsSetup ? "업무담당자 계정을 만드세요" : "관리자 계정으로 로그인하세요"}</h1><p>{needsSetup ? "처음 한 번만 관리자 아이디와 숫자 비밀번호를 설정합니다." : "관리자만 전체 운행 기록과 설정을 관리할 수 있습니다."}</p></div>
          <form onSubmit={submitAuth} className="auth-form">
            {needsSetup && <label>담당자 이름<input value={authForm.displayName} onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="예: 홍길동" /></label>}
            <label>아이디<input value={authForm.username} onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))} placeholder="3~24자" autoComplete="username" /></label>
            <label>간편 비밀번호<input type="password" inputMode="numeric" value={authForm.pin} onChange={(event) => setAuthForm((current) => ({ ...current, pin: event.target.value }))} placeholder="숫자 4~12자리" autoComplete={needsSetup ? "new-password" : "current-password"} /></label>
            {authError && <p className="auth-error">{authError}</p>}
            <button disabled={authBusy}>{authBusy ? "확인 중…" : needsSetup ? "관리자 설정 완료" : "관리자 로그인"}</button>
            <button type="button" className="back-link" onClick={() => { setEntryMode("choose"); setAuthError(""); }}>처음 화면으로</button>
          </form>
        </> : <>
          <div className="auth-copy"><span className="eyebrow">버스 운행</span><h1>운행 코드를 입력하세요</h1><p>관리자가 배부한 코드는 담당 차량과 사용 기간에 맞춰 운행일지 작성 권한을 부여합니다.</p></div>
          <form onSubmit={submitOperationLogin} className="auth-form">
            <label>운행 코드<input value={operationCode} onChange={(event) => setOperationCode(event.target.value.toUpperCase())} placeholder="예: BUS-ABCDEFGH" autoCapitalize="characters" autoComplete="off" /></label>
            {authError && <p className="auth-error">{authError}</p>}
            <button disabled={authBusy}>{authBusy ? "확인 중…" : "운행일지 시작"}</button>
            <button type="button" className="back-link" onClick={() => { setEntryMode("choose"); setAuthError(""); }}>처음 화면으로</button>
          </form>
        </>}
      </section>
    </main>
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">안전</div>
          <div><strong>통학버스 안전일지</strong><span>학교용 운행 관리</span></div>
        </div>
        <nav aria-label="주요 메뉴">
          <NavButton active={view === "log"} onClick={() => setView("log")}>오늘의 운행일지</NavButton>
          {authUser.role === "admin" && <NavButton active={view === "stats"} onClick={() => setView("stats")}>월별 미운행 통계</NavButton>}
          <NavButton active={view === "checklist"} onClick={() => setView("checklist")}>안전 점검 체크리스트</NavButton>
          {authUser.role === "admin" && <NavButton active={view === "settings"} onClick={() => setView("settings")}>차량·학생 설정</NavButton>}
        </nav>
        <div className="sidebar-note"><span>운행 기간</span><strong>{settingsForm.startDate.replaceAll("-", ". ")} — {settingsForm.endDate.replaceAll("-", ". ")}</strong><small>공휴일 자동 제외 · 재량휴업일 {schoolData?.exclusions.length ?? 0}일</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">2026학년도</span><h1>{view === "log" ? "오늘의 운행일지" : view === "stats" ? "월별 미운행 통계" : view === "checklist" ? "안전 점검 체크리스트" : "차량·학생 설정"}</h1></div>
          <div className="account-area"><div className="today"><span>{authUser.demo ? "읽기 전용 체험" : authUser.role === "admin" ? "업무담당자" : authUser.role === "driver" ? "운전자" : "동승자"}</span><strong>{authUser.display_name ?? authUser.username}</strong></div><button onClick={logout}>{authUser.demo ? "체험 종료" : "로그아웃"}</button></div>
        </header>
        {authUser.demo && <div className="demo-banner"><strong>체험 모드</strong><span>샘플 데이터로 화면을 둘러보는 중입니다. 입력 내용은 실제로 저장되지 않습니다.</span></div>}

        {view === "log" && (
          <div className="content-grid">
            <section className="main-panel">
              <div className="control-row">
                <label>운행일<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
                <label>차량<select value={busId} onChange={(event) => setBusId(Number(event.target.value))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label} · {bus.plate}</option>)}</select></label>
                <div className="driver-chip"><span>운전자</span><strong>{selectedBus.driver}</strong></div>
              </div>
              <div className={excludedReason ? "run-status excluded" : "run-status"}><div><span className="status-dot" />{excludedReason ? "자동 제외일" : runStatus === "operated" ? "정상 운행" : "차량 미운행"}</div><p>{excludedReason ? `${excludedReason} — 운행일지 작성 대상에서 제외됩니다.` : "대한민국 공휴일과 등록된 재량휴업일은 자동으로 일지에서 제외됩니다."}</p>{!excludedReason && <div className="run-toggle"><button className={runStatus === "operated" ? "active" : ""} onClick={() => setRunStatus("operated")}>정상 운행</button><button className={runStatus === "not_operated" ? "active warning" : ""} onClick={() => setRunStatus("not_operated")}>미운행</button></div>}</div>
              {runStatus === "not_operated" && !excludedReason && <div className="not-running-reason"><label>미운행 사유<input value={runReason} onChange={(event) => setRunReason(event.target.value)} placeholder="예: 차량 정비, 운전자 사정" /></label></div>}
              <div className="panel-heading"><div><h2>{selectedBus.label} 등교 탑승 명단</h2><p>학생별 등교 탑승 여부와 특이사항을 기록하세요.</p></div><div className="count"><strong>{boardedCount}</strong><span>/ {students.length}명 탑승</span></div></div>
              {runStatus === "operated" && <div className="student-list">
                {students.length === 0 && <div className="empty-state"><strong>이 날짜에 배정된 학생이 없습니다.</strong><span>관리자 설정에서 학생과 차량 배정 기간을 등록하세요.</span></div>}
                {students.map((student) => (
                  <div className="student-row" key={student.id}>
                    <button className={student.boarded ? "boarding checked" : "boarding"} onClick={() => toggleBoarding(student.id)} aria-label={`${student.name} 탑승 여부`}>{student.boarded ? "✓" : "–"}</button>
                    <div className="student-info"><strong>{student.name}</strong><span>{student.detail}</span></div>
                    <span className={student.boarded ? "badge boarded" : "badge absent"}>{student.boarded ? "탑승" : "미탑승"}</span>
                    <input aria-label={`${student.name} 비고`} value={student.note} onChange={(event) => updateNote(student.id, event.target.value)} placeholder="비고 입력" />
                  </div>
                ))}
              </div>}
              <div className="save-bar"><span>{dataMessage || (saved ? "저장되었습니다." : excludedReason ? "제외일은 미운행 날짜에 자동 포함됩니다." : "변경 내용을 확인한 뒤 저장하세요.")}</span><button onClick={saveRun} disabled={Boolean(excludedReason)}>{excludedReason ? "자동 제외일" : runStatus === "operated" ? "운행일지 저장" : "미운행 저장"}</button></div>
            </section>

            <aside className="summary-panel">
              <div className="summary-card dark"><span>관리 차량</span><strong>{liveBuses.length}대</strong><p>등교버스만 표시됩니다</p><div className="progress"><i style={{ width: "100%" }} /></div></div>
              <div className="summary-card"><span>빠른 확인</span><dl><div><dt>현재 배정 학생</dt><dd>{students.length}명</dd></div><div><dt>미탑승 학생</dt><dd>{students.length - boardedCount}명</dd></div><div><dt>비고 작성</dt><dd>{students.filter((student) => student.note).length}건</dd></div></dl></div>
              <div className="summary-card holiday"><span>다가오는 법정 공휴일</span><strong>{nextHoliday ? `${Number(nextHoliday.date.slice(5, 7))}월 ${Number(nextHoliday.date.slice(8, 10))}일` : "자료 없음"}</strong><p>{nextHoliday?.names.join(", ") ?? "학사일정에서 제외일을 확인하세요"}</p></div>
            </aside>
          </div>
        )}

        {view === "stats" && (
          <section className="main-panel wide">
            <div className="panel-heading"><div><span className="eyebrow">안전 점검 사이트 입력용</span><h2>월별 미운행 날짜</h2><p>공휴일·재량휴업일과 실제 미운행 기록을 차량별로 모았습니다.</p></div><label className="month-control">조회 월<input type="month" value={statisticsMonth} onChange={(event) => setStatisticsMonth(event.target.value)} /></label></div>
            <div className="stats-summary"><div><span>운행 대상 차량</span><strong>{statistics?.buses.length ?? 0}대</strong></div><div><span>공통 미운행일</span><strong>{(statistics?.holidays.length ?? 0) + (statistics?.exclusions.length ?? 0)}일</strong></div><div><span>개별 미운행</span><strong>{statistics?.nonOperatingRuns.length ?? 0}건</strong></div></div>
            <div className="stats-list">{statisticRows.map((row) => <div className="stats-row" key={row.bus}><strong>{row.bus}</strong><div>{row.dates.length ? row.dates.map((item) => <span key={item.date} title={item.reason}>{koreanDate(item.date)}</span>) : <span>미운행 없음</span>}</div><small>{row.dates.length}일</small></div>)}</div>
            <p className="prototype-note">공휴일과 재량휴업일은 모든 차량에 공통으로 포함되며, 차량별 미운행 기록이 추가됩니다.</p>
          </section>
        )}

        {view === "checklist" && (
          <section className="main-panel wide checklist-panel">
            <div className="panel-heading"><div><span className="eyebrow">매월 제출</span><h2>안전 점검 체크리스트</h2><p>선택한 세트에 묶인 차량을 한 번에 점검합니다.</p></div><div className="inspection-controls"><input type="month" value={inspectionMonth} onChange={(event) => setInspectionMonth(event.target.value)} /><select value={inspectionGroupId ?? ""} onChange={(event) => setInspectionGroupId(Number(event.target.value))}>{schoolData?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><div className="completion"><strong>{Object.keys(answers).length}</strong><span>/ {checklistItems.length} 완료</span></div></div></div>
            {inspectionGroups.map((group) => <div className="check-group" key={group.title}><h3>{group.title}</h3>{group.items.map((item) => { const canEdit = authUser.role === "admin" || item.responsible_role === "all" || item.responsible_role === authUser.role; return <div className={canEdit ? "check-row" : "check-row read-only"} key={item.code}><span>{item.content}{item.responsible_role !== "all" && <small>{item.responsible_role === "driver" ? "운전자 담당" : "동승자 담당"}</small>}</span><div>{(["예", "아니요", "해당없음"] as const).map((answer) => <button key={answer} disabled={!canEdit} className={answers[item.code] === answer ? "answer active" : "answer"} onClick={() => setAnswers((current) => ({ ...current, [item.code]: answer }))}>{answer}</button>)}</div></div>; })}</div>)}
            <div className="save-bar"><span>{dataMessage || "모든 항목 확인 후 완료 상태로 저장할 수 있습니다."}</span><div className="save-actions"><button className="secondary-save" onClick={() => saveInspection("draft")}>임시 저장</button><button onClick={() => saveInspection("complete")}>점검 완료</button></div></div>
          </section>
        )}

        {view === "settings" && (
          <section className="settings-page">
            <div className="settings-grid">
              <div className="main-panel"><div className="panel-heading"><div><h2>차량 정보</h2><p>원본은 안전하게 저장하고, 목록에서는 차량번호와 운전자명을 가립니다.</p></div><span className="eyebrow">총 {liveBuses.length}대</span></div><div className="bus-table"><div className="table-head"><span>차량</span><span>차량번호</span><span>운전자</span><span>배정 학생</span></div>{liveBuses.map((bus) => <button className={settingsBusId === bus.id ? "table-row selected-row" : "table-row"} key={bus.id} onClick={() => setSettingsBusId(bus.id)}><strong>{bus.label}</strong><span>{bus.plate}</span><span>{bus.driver}</span><span>{bus.students}명</span></button>)}</div></div>
              <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "saveBus", id: settingsBusId, ...busForm }, "차량 정보가 저장되었습니다."); }}><span>선택 차량 수정</span><label>차량번호<input value={busForm.plateNumber} onChange={(event) => setBusForm((current) => ({ ...current, plateNumber: event.target.value }))} placeholder="예: 78가 1234" /></label><label>운전자 성명<input value={busForm.driverName} onChange={(event) => setBusForm((current) => ({ ...current, driverName: event.target.value }))} /></label><label>동승자 성명<input value={busForm.attendantName} onChange={(event) => setBusForm((current) => ({ ...current, attendantName: event.target.value }))} /></label><button className="primary-full">차량 정보 저장</button></form>
            </div>

            <div className="settings-grid settings-lower">
              <div className="main-panel settings-form-panel"><form onSubmit={async (event) => { event.preventDefault(); const ok = await adminAction({ action: "addStudentAndAssign", ...studentForm }, "학생을 등록하고 차량에 배정했습니다."); if (ok) setStudentForm((current) => ({ ...current, name: "", stopName: "" })); }}><div className="panel-heading"><div><h2>학생 등록 및 차량 배정</h2><p>학생은 같은 기간에 한 차량에만 배정됩니다.</p></div></div><div className="form-grid"><label>학생 이름<input value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>학년<select value={studentForm.grade} onChange={(event) => setStudentForm((current) => ({ ...current, grade: Number(event.target.value) }))}>{[1,2,3,4,5,6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label><label>반<input value={studentForm.className} onChange={(event) => setStudentForm((current) => ({ ...current, className: event.target.value }))} /></label><label>등교 차량<select value={studentForm.busId} onChange={(event) => setStudentForm((current) => ({ ...current, busId: Number(event.target.value) }))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label}</option>)}</select></label><label className="span-two">승차 정류장<input value={studentForm.stopName} onChange={(event) => setStudentForm((current) => ({ ...current, stopName: event.target.value }))} /></label><label>배정 시작일<input type="date" value={studentForm.startDate} onChange={(event) => setStudentForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>배정 종료일<input type="date" value={studentForm.endDate} onChange={(event) => setStudentForm((current) => ({ ...current, endDate: event.target.value }))} /></label></div><div className="form-footer"><button>학생 등록 및 배정</button></div></form><form className="reassign-form" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "reassignStudent", ...reassignForm }, "기존 배정을 종료하고 새 차량에 배정했습니다."); }}><div><strong>기존 학생 차량 변경</strong><span>이전 배정은 새 시작일 전날 자동 종료됩니다.</span></div><select value={reassignForm.studentId} onChange={(event) => setReassignForm((current) => ({ ...current, studentId: Number(event.target.value) }))}>{schoolData?.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.grade}학년 {student.class_name}</option>)}</select><select value={reassignForm.busId} onChange={(event) => setReassignForm((current) => ({ ...current, busId: Number(event.target.value) }))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label}</option>)}</select><input value={reassignForm.stopName} onChange={(event) => setReassignForm((current) => ({ ...current, stopName: event.target.value }))} placeholder="새 정류장" /><input type="date" value={reassignForm.startDate} onChange={(event) => setReassignForm((current) => ({ ...current, startDate: event.target.value }))} /><input type="date" value={reassignForm.endDate} onChange={(event) => setReassignForm((current) => ({ ...current, endDate: event.target.value }))} /><button>차량 변경</button></form></div>

              <div className="settings-side-stack">
                <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "saveSettings", ...settingsForm }, "운행 기간과 공휴일 설정을 저장했습니다."); }}><span>학년도 운행 기간</span><label>학년도<input type="number" value={settingsForm.schoolYear} onChange={(event) => setSettingsForm((current) => ({ ...current, schoolYear: Number(event.target.value) }))} /></label><label>운행 시작일<input type="date" value={settingsForm.startDate} onChange={(event) => setSettingsForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>운행 종료일<input type="date" value={settingsForm.endDate} onChange={(event) => setSettingsForm((current) => ({ ...current, endDate: event.target.value }))} /></label><label className="check-setting"><input type="checkbox" checked={settingsForm.includeLaborDay} onChange={(event) => setSettingsForm((current) => ({ ...current, includeLaborDay: event.target.checked }))} />노동절을 미운행일에 포함</label><label className="check-setting"><input type="checkbox" checked={settingsForm.includeElectionDay} onChange={(event) => setSettingsForm((current) => ({ ...current, includeElectionDay: event.target.checked }))} />법정 선거일을 미운행일에 포함</label><button className="primary-full">운행 기간 저장</button></form>
                <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); const ok = await adminAction({ action: "addExclusion", date: exclusionForm.date, kind: "discretionary_holiday", note: exclusionForm.note }, "재량휴업일을 추가했습니다."); if (ok) setExclusionForm((current) => ({ ...current, date: "" })); }}><span>재량휴업일</span><label>날짜<input type="date" value={exclusionForm.date} onChange={(event) => setExclusionForm((current) => ({ ...current, date: event.target.value }))} required /></label><label>사유<input value={exclusionForm.note} onChange={(event) => setExclusionForm((current) => ({ ...current, note: event.target.value }))} /></label>{schoolData?.exclusions.slice(0,4).map((item) => <div className="calendar-tag" key={item.id}><strong>{koreanDate(item.date)}</strong><span>{item.note ?? "제외일"}</span></div>)}<button className="primary-full">제외일 추가</button></form>
              </div>
            </div>

            <div className="settings-grid settings-lower">
              <form className="main-panel settings-form-panel" onSubmit={async (event) => { event.preventDefault(); await issueOperationCode(); }}><div className="panel-heading"><div><h2>버스 운행 코드 발급</h2><p>운전자 또는 동승자에게 코드를 전달하면 담당 차량과 기간 내에서만 운행일지를 작성할 수 있습니다.</p></div></div><div className="form-grid"><label>수령자 이름<input required value={accountForm.displayName} onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="예: 홍길동" /></label><label>역할<select value={accountForm.role} onChange={(event) => setAccountForm((current) => ({ ...current, role: event.target.value as typeof current.role }))}><option value="driver">운전자</option><option value="attendant">동승자</option></select></label><label>담당 차량<select value={accountForm.busId} onChange={(event) => setAccountForm((current) => ({ ...current, busId: Number(event.target.value) }))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label}</option>)}</select></label><label>유효 시작일<input type="date" value={accountForm.startDate} onChange={(event) => setAccountForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>유효 종료일<input type="date" value={accountForm.endDate} onChange={(event) => setAccountForm((current) => ({ ...current, endDate: event.target.value }))} /></label></div><div className="form-footer"><button>운행 코드 발급</button></div><div className="issued-code-list"><strong>발급된 코드</strong>{(schoolData?.users ?? []).filter((user) => user.role === "driver" || user.role === "attendant").map((user) => { const assignment = schoolData?.userBuses.find((item) => item.user_id === user.id); const assignedBus = schoolData?.buses.find((bus) => bus.id === assignment?.bus_id); return <div className="issued-code-row" key={user.id}><code>{user.username}</code><span>{user.display_name ?? "이름 없음"} · {user.role === "driver" ? "운전자" : "동승자"} · {assignedBus ? `${assignedBus.bus_number}호차` : "차량 미배정"}</span><small>{assignment ? `${assignment.start_date} ~ ${assignment.end_date}` : "기간 미설정"}</small></div>; })}</div></form>

              <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "addGroup", name: groupForm.name }, "점검 세트를 추가했습니다."); }}><span>점검 세트 관리</span><label>세트 선택<select value={groupForm.groupId} onChange={(event) => { const groupId = Number(event.target.value); setGroupForm((current) => ({ ...current, groupId, busIds: schoolData?.groupBuses.filter((item) => item.group_id === groupId).map((item) => item.bus_id) ?? [] })); }}>{schoolData?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="bus-check-grid">{liveBuses.map((bus) => <label key={bus.id}><input type="checkbox" checked={groupForm.busIds.includes(bus.id)} onChange={(event) => setGroupForm((current) => ({ ...current, busIds: event.target.checked ? [...current.busIds, bus.id] : current.busIds.filter((id) => id !== bus.id) }))} />{bus.label}</label>)}</div><button type="button" className="primary-full" onClick={() => adminAction({ action: "saveGroupBuses", groupId: groupForm.groupId, busIds: groupForm.busIds }, "점검 세트 차량 구성을 저장했습니다.")}>차량 묶음 저장</button><label>새 세트 이름<input value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} /></label><button className="secondary-button full">새 세트 추가</button><button type="button" className="danger-button" onClick={() => adminAction({ action: "deleteGroup", groupId: groupForm.groupId }, "점검 세트를 삭제했습니다.")}>선택 세트 삭제</button></form>
            </div>
            <div className="main-panel checklist-editor"><div className="panel-heading"><div><h2>점검 문구와 담당 역할</h2><p>원본 서식에 맞게 문구를 교정하고, 필요하면 운전자·동승자 담당 항목을 나눌 수 있습니다.</p></div><span className="eyebrow">{checklistItems.length}개 항목</span></div><div className="checklist-edit-list">{schoolData?.checklistItems.map((item) => { const draft = checklistDrafts[item.id] ?? { content: item.content, responsibleRole: item.responsible_role }; return <div className="checklist-edit-row" key={item.id}><span>{item.code}</span><strong>{item.category}</strong><input value={draft.content} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [item.id]: { ...draft, content: event.target.value } }))} /><select value={draft.responsibleRole} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [item.id]: { ...draft, responsibleRole: event.target.value as typeof draft.responsibleRole } }))}><option value="all">공동 작성</option><option value="driver">운전자</option><option value="attendant">동승자</option></select><button onClick={() => adminAction({ action: "updateChecklistItem", id: item.id, content: draft.content, responsibleRole: draft.responsibleRole }, "점검 항목을 수정했습니다.")}>저장</button></div>; })}</div></div>
            {dataMessage && <div className="settings-message">{dataMessage}</div>}
          </section>
        )}
      </section>
    </main>
  );
}
