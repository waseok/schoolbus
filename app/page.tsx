"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { maskName, maskPlate } from "./masking";
import { defaultChecklistItems } from "../lib/checklist";

const StatisticsView = dynamic(() => import("./components/statistics-view"), { loading: () => <div className="main-panel wide view-loading">통계를 불러오는 중입니다…</div> });
const ChecklistView = dynamic(() => import("./components/checklist-view"), { loading: () => <div className="main-panel wide view-loading">점검표를 불러오는 중입니다…</div> });

type View = "log" | "stats" | "checklist" | "settings";
type SettingsSection = "buses" | "students" | "calendar" | "codes" | "checklist";
type EntryMode = "choose" | "admin" | "operation";
type SignedInUser = { id: number; username: string; display_name: string | null; role: "admin" | "driver" | "attendant"; demo?: boolean };
type ApiBus = { id: number; bus_number: number; plate_number: string | null; driver_name: string | null; attendant_name: string | null };
type ApiStudent = { id: number; name: string; grade: number; class_name: string };
type ApiAssignment = { id: number; student_id: number; bus_id: number; stop_name: string | null; start_date: string; end_date: string; boarding_order?: number };
type ApiGroup = { id: number; name: string };
type ApiChecklistItem = { id: number; code: string; category: string; content: string; responsible_role: "all" | "driver" | "attendant"; sort_order: number };
type ApiUser = { id: number; username: string; display_name: string | null; role: "admin" | "driver" | "attendant"; active: number };
type ApiUserBus = { id: number; user_id: number; bus_id: number; start_date: string; end_date: string };
type SchoolData = { settings: Record<string, unknown> | null; buses: ApiBus[]; students: ApiStudent[]; assignments: ApiAssignment[]; exclusions: Array<{ id: number; date: string; kind: string; note: string | null }>; groups: ApiGroup[]; groupBuses: Array<{ group_id: number; bus_id: number }>; users: ApiUser[]; userBuses: ApiUserBus[]; checklistItems: ApiChecklistItem[] };
type RunPayload = { run: { status?: "operated" | "not_operated"; reason?: string | null } | null; boarding: Array<{ student_id: number; boarded: number; note: string | null }> };
type BootstrapRun = { bus_id: number; date: string; status?: "operated" | "not_operated"; reason?: string | null; boarding_records: RunPayload["boarding"] };
type BootstrapData = SchoolData & { initialRuns?: BootstrapRun[]; initialDate?: string };
type StatisticsData = { month: string; holidays: Array<{ date: string; names: string[] }>; exclusions: Array<{ date: string; kind: string; note: string | null }>; nonOperatingRuns: Array<{ bus_id: number; date: string; reason: string | null }>; buses: Array<{ id: number; bus_number: number }> };
type StudentAbsenceData = { records: Array<{ name: string; grade: number; className: string; date: string; busNumber: number; note: string }> };
type RunStudent = { id: number; assignmentId: number; name: string; detail: string; stopName: string; boarded: boolean; note: string };

function localDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isWeekend(date: string) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

const buses = [
  { id: 1, label: "1호차", plate: "78가 **34", driver: "김*수", attendant: "-", students: 22 },
  { id: 2, label: "2호차", plate: "71나 **82", driver: "박*준", attendant: "-", students: 18 },
  { id: 3, label: "3호차", plate: "75다 **09", driver: "이*희", attendant: "-", students: 20 },
  { id: 4, label: "4호차", plate: "73라 **61", driver: "최*호", attendant: "-", students: 16 },
];

const initialStudents: RunStudent[] = [
  { id: 1, assignmentId: 1, name: "김도윤", detail: "1학년 2반 · 은빛마을 정류장", stopName: "은빛마을 정류장", boarded: true, note: "" },
  { id: 2, assignmentId: 2, name: "박서연", detail: "1학년 3반 · 중앙공원 앞", stopName: "중앙공원 앞", boarded: true, note: "" },
  { id: 3, assignmentId: 3, name: "이준우", detail: "2학년 1반 · 한솔아파트", stopName: "한솔아파트", boarded: false, note: "병원 진료" },
  { id: 4, assignmentId: 4, name: "정하윤", detail: "2학년 2반 · 중앙공원 앞", stopName: "중앙공원 앞", boarded: true, note: "" },
  { id: 5, assignmentId: 5, name: "최지안", detail: "3학년 1반 · 은빛마을 정류장", stopName: "은빛마을 정류장", boarded: true, note: "" },
];

const emptyStudents: RunStudent[] = [];

function buildRunStudents(data: SchoolData, selectedBusId: number, date: string) {
  const assignments = data.assignments.filter((assignment) => assignment.bus_id === selectedBusId && assignment.start_date <= date && assignment.end_date >= date);
  const useStopOrder = assignments.some((assignment) => !assignment.boarding_order);
  return assignments.flatMap((assignment) => {
    const student = data.students.find((item) => item.id === assignment.student_id);
    return student ? [{ assignment, student }] : [];
  }).sort((a, b) => {
    if (!useStopOrder) return (a.assignment.boarding_order ?? 0) - (b.assignment.boarding_order ?? 0);
    return (a.assignment.stop_name || "정류장 미등록").localeCompare(b.assignment.stop_name || "정류장 미등록", "ko")
      || a.student.grade - b.student.grade
      || a.student.class_name.localeCompare(b.student.class_name, "ko")
      || a.student.name.localeCompare(b.student.name, "ko");
  }).map(({ assignment, student }) => ({
    id: student.id,
    assignmentId: assignment.id,
    name: student.name,
    detail: `${student.grade}학년 ${student.class_name} · ${assignment.stop_name || "정류장 미등록"}`,
    stopName: assignment.stop_name || "정류장 미등록",
    boarded: true,
    note: "",
  }));
}

function assignmentPeriodForDate(settings: { startDate: string; endDate: string; semester1StartDate: string; semester1EndDate: string; semester2StartDate: string; semester2EndDate: string }, date: string) {
  if (date <= settings.semester1EndDate) return { startDate: settings.semester1StartDate, endDate: settings.semester1EndDate };
  if (date <= settings.semester2EndDate) return { startDate: settings.semester2StartDate, endDate: settings.semester2EndDate };
  return { startDate: settings.startDate, endDate: settings.endDate };
}

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
  const [dataBusy, setDataBusy] = useState(false);
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [students, setStudents] = useState(emptyStudents);
  const [answers, setAnswers] = useState<Record<string, "예" | "아니요" | "해당없음">>({});
  const [statisticsMonth, setStatisticsMonth] = useState(() => localDate().slice(0, 7));
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [studentAbsences, setStudentAbsences] = useState<StudentAbsenceData | null>(null);
  const [selectedAbsenceStudent, setSelectedAbsenceStudent] = useState("");
  const [inspectionMonth, setInspectionMonth] = useState(() => localDate().slice(0, 7));
  const [inspectionGroupId, setInspectionGroupId] = useState<number | null>(null);
  const [settingsBusId, setSettingsBusId] = useState(1);
  const [busForm, setBusForm] = useState({ plateNumber: "", driverName: "", attendantName: "" });
  const [studentForm, setStudentForm] = useState({ name: "", grade: 1, className: "1반", busId: 1, stopName: "", startDate: "2026-03-02", endDate: "2027-02-28" });
  const [studentEditForm, setStudentEditForm] = useState({ id: 0, name: "", grade: 1, className: "", assignmentId: 0, stopName: "" });
  const [studentSearch, setStudentSearch] = useState("");
  const [exclusionForm, setExclusionForm] = useState({ date: "", note: "재량휴업일" });
  const [accountForm, setAccountForm] = useState({ displayName: "", role: "driver" as "driver" | "attendant", busId: 1, startDate: "2026-03-02", endDate: "2027-02-28" });
  const [groupForm, setGroupForm] = useState({ name: "새 점검 세트", groupId: 0, busIds: [] as number[] });
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("buses");
  const [settingsForm, setSettingsForm] = useState({ schoolYear: 2026, startDate: "2026-03-02", endDate: "2027-02-28", semester1StartDate: "2026-03-02", semester1EndDate: "2026-08-31", semester2StartDate: "2026-09-01", semester2EndDate: "2027-02-28", includeLaborDay: true, includeElectionDay: true });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDates, setImportDates] = useState({ startDate: "2026-03-02", endDate: "2027-02-28" });
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importSucceeded, setImportSucceeded] = useState(false);
  const [checklistDrafts, setChecklistDrafts] = useState<Record<number, { content: string; responsibleRole: "all" | "driver" | "attendant" }>>({});
  const [holidays, setHolidays] = useState<Array<{ date: string; names: string[] }>>([]);
  const holidayCache = useRef<Record<string, Array<{ date: string; names: string[] }>>>({});
  const runCache = useRef(new Map<string, RunPayload>());
  const [managementLoaded, setManagementLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runStatus, setRunStatus] = useState<"operated" | "not_operated">("operated");
  const [runReason, setRunReason] = useState("");
  const selectedBus = liveBuses.find((bus) => bus.id === busId) ?? liveBuses[0] ?? buses[0];
  const boardedCount = useMemo(() => students.filter((student) => student.boarded).length, [students]);
  const holiday = holidays.find((item) => item.date === selectedDate);
  const calendarExclusion = schoolData?.exclusions.find((item) => item.date === selectedDate);
  const excludedReason = isWeekend(selectedDate) ? "주말" : holiday?.names.join(", ") ?? calendarExclusion?.note ?? null;
  const nextHoliday = holidays.find((item) => item.date > selectedDate);
  const statisticRows = useMemo(() => {
    if (!statistics) return [];
    const common = [
      ...statistics.holidays.map((item) => ({ date: item.date, reason: item.names.join(", "), type: item.names.includes("주말") ? "weekend" : "holiday" })),
      ...statistics.exclusions.map((item) => ({ date: item.date, reason: item.note || "학교 제외일", type: "manual" })),
    ];
    return statistics.buses.map((bus) => {
      const individual = statistics.nonOperatingRuns.filter((run) => run.bus_id === bus.id).map((run) => ({ date: run.date, reason: run.reason || "미운행 기록", type: "run" }));
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
  const operationPeople = useMemo(() => {
    const people = new Map<string, "driver" | "attendant">();
    schoolData?.buses.forEach((bus) => {
      if (bus.driver_name?.trim()) people.set(`driver:${bus.driver_name.trim()}`, "driver");
      if (bus.attendant_name?.trim()) people.set(`attendant:${bus.attendant_name.trim()}`, "attendant");
    });
    return Array.from(people.entries()).map(([key, role]) => ({ role, name: key.slice(key.indexOf(":") + 1) }));
  }, [schoolData]);

  useEffect(() => {
    if (view !== "log") return;
    const year = selectedDate.slice(0, 4);
    const cached = holidayCache.current[year];
    if (cached) {
      setHolidays(cached);
      return;
    }
    fetch(`/api/holidays?year=${year}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { holidays: Array<{ date: string; names: string[] }> }) => {
        holidayCache.current[year] = data.holidays;
        setHolidays(data.holidays);
      })
      .catch(() => setHolidays([]));
  }, [selectedDate, view]);

  // Bootstrap runs once on mount; subsequent calls happen explicitly after login.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (managementLoaded || !authUser) return;
    const needsManagementData = view === "checklist" || (authUser.role === "admin" && (view === "settings" || view === "stats"));
    if (!needsManagementData) return;
    void loadManagementData();
  }, [authUser, managementLoaded, view]);

  useEffect(() => {
    if (view !== "log" || !schoolData || !authUser) return;
    const rows = buildRunStudents(schoolData, busId, selectedDate);
    const cacheKey = `${busId}:${selectedDate}`;
    const cached = runCache.current.get(cacheKey);
    if (cached) {
      setRunStatus(cached.run?.status ?? "operated");
      setRunReason(cached.run?.reason ?? "");
      setStudents(rows.map((student) => {
        const savedRecord = cached.boarding.find((record) => record.student_id === student.id);
        return savedRecord ? { ...student, boarded: Boolean(savedRecord.boarded), note: savedRecord.note ?? "" } : student;
      }));
      setSaved(Boolean(cached.run));
      setDataMessage(cached.run ? "저장된 운행일지와 최신 학생 명단을 불러왔습니다." : "최신 학생 명단을 불러왔습니다. 탑승 여부를 확인한 뒤 저장하세요.");
      return;
    }
    const controller = new AbortController();
    setStudents(rows);
    setSaved(false);
    setDataMessage("운행일지와 최신 학생 명단을 불러오는 중입니다…");
    fetch(`/api/runs?busId=${busId}&date=${selectedDate}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: RunPayload) => {
        runCache.current.set(cacheKey, payload);
        setRunStatus(payload.run?.status ?? "operated");
        setRunReason(payload.run?.reason ?? "");
        setSaved(Boolean(payload.run));
        setStudents((current) => current.map((student) => {
          const savedRecord = payload.boarding.find((record) => record.student_id === student.id);
          return savedRecord ? { ...student, boarded: Boolean(savedRecord.boarded), note: savedRecord.note ?? "" } : student;
        }));
        setDataMessage(payload.run ? "저장된 운행일지와 최신 학생 명단을 불러왔습니다." : "최신 학생 명단을 불러왔습니다. 탑승 여부를 확인한 뒤 저장하세요.");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") setDataMessage("운행일지를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.");
      });
    return () => controller.abort();
  }, [schoolData, authUser, busId, selectedDate, view]);

  useEffect(() => {
    if (view === "stats" && authUser?.role === "admin") {
      fetch(`/api/statistics?month=${statisticsMonth}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: StatisticsData) => setStatistics(data)).catch(() => setDataMessage("월별 통계를 불러오지 못했습니다."));
      fetch(`/api/student-statistics?month=${statisticsMonth}`).then((response) => response.ok ? response.json() : Promise.reject()).then((data: StudentAbsenceData) => setStudentAbsences(data)).catch(() => setStudentAbsences(null));
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
    const settings = schoolData?.settings as { school_year?: number; start_date?: string; end_date?: string; semester1_start_date?: string; semester1_end_date?: string; semester2_start_date?: string; semester2_end_date?: string; include_labor_day?: number; include_election_day?: number } | null;
    if (settings) {
      const next = { schoolYear: settings.school_year ?? 2026, startDate: settings.start_date ?? "2026-03-02", endDate: settings.end_date ?? "2027-02-28", semester1StartDate: settings.semester1_start_date ?? "2026-03-02", semester1EndDate: settings.semester1_end_date ?? "2026-08-31", semester2StartDate: settings.semester2_start_date ?? "2026-09-01", semester2EndDate: settings.semester2_end_date ?? "2027-02-28", includeLaborDay: Boolean(settings.include_labor_day), includeElectionDay: Boolean(settings.include_election_day) };
      const assignmentPeriod = assignmentPeriodForDate(next, localDate());
      setSettingsForm(next);
      setStudentForm((current) => ({ ...current, ...assignmentPeriod }));
      setImportDates(assignmentPeriod);
    }
  }, [schoolData]);

  useEffect(() => {
    if (!schoolData?.students.some((student) => student.id === studentEditForm.id)) setStudentEditForm((current) => ({ ...current, id: 0, assignmentId: 0 }));
  }, [schoolData, studentEditForm.id]);

  useEffect(() => {
    if (!dataMessage || dataBusy) return;
    const timeout = window.setTimeout(() => setDataMessage(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [dataMessage, dataBusy]);

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

  function applyLoadedSchoolData(data: SchoolData) {
    setSchoolData(data);
    const counts = new Map<number, number>();
    const today = localDate();
    data.assignments.filter((assignment) => assignment.start_date <= today && assignment.end_date >= today).forEach((assignment) => counts.set(assignment.bus_id, (counts.get(assignment.bus_id) ?? 0) + 1));
    const mapped = data.buses.map((bus) => ({ id: bus.id, label: `${bus.bus_number}호차`, plate: maskPlate(bus.plate_number), driver: maskName(bus.driver_name), attendant: maskName(bus.attendant_name) || "-", students: counts.get(bus.id) ?? 0 }));
    setLiveBuses(mapped);
    if (mapped.length && !mapped.some((bus) => bus.id === busId)) setBusId(mapped[0].id);
  }

  async function loadBootstrap() {
    try {
      const date = localDate();
      const response = await fetch(`/api/data?bootstrap=1&date=${date}`);
      const payload = await response.json() as { user: SignedInUser | null; needsSetup: boolean; data: BootstrapData | null; error?: string };
      setAuthUser(payload.user);
      setNeedsSetup(payload.needsSetup);
      setManagementLoaded(false);
      if (payload.data) {
        runCache.current.clear();
        payload.data.initialRuns?.forEach((run) => runCache.current.set(`${run.bus_id}:${run.date}`, { run: { status: run.status, reason: run.reason }, boarding: run.boarding_records ?? [] }));
        applyLoadedSchoolData(payload.data);
      } else {
        setSchoolData(null);
        setStudents(emptyStudents);
      }
    } catch {
      setAuthUser(null);
      setAuthError("로그인 상태와 학교 데이터를 불러오지 못했습니다.");
    }
  }

  async function loadSchoolData() {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (!response.ok) { setDataMessage("학교 데이터를 불러오지 못했습니다."); return; }
    applyLoadedSchoolData(await response.json() as SchoolData);
  }

  async function loadManagementData() {
    const response = await fetch("/api/data?scope=management", { cache: "no-store" });
    if (!response.ok) { setDataMessage("관리 화면 데이터를 불러오지 못했습니다."); return; }
    const data = await response.json() as Pick<SchoolData, "groups" | "groupBuses" | "users" | "userBuses" | "checklistItems" | "students" | "assignments" | "exclusions">;
    if (schoolData) applyLoadedSchoolData({ ...schoolData, ...data });
    setManagementLoaded(true);
  }

  function applyLocalDataChange(body: Record<string, unknown>) {
    const action = String(body.action ?? "");
    if (!["saveBus", "updateStudent", "moveAssignment", "deleteAssignment", "deleteBusAssignments", "deleteAllStudents"].includes(action)) return false;

    setSchoolData((current) => {
      if (!current) return current;
      let next = current;
      if (action === "saveBus") {
        next = { ...current, buses: current.buses.map((bus) => bus.id === Number(body.id) ? { ...bus, plate_number: String(body.plateNumber ?? "").trim() || null, driver_name: String(body.driverName ?? "").trim() || null, attendant_name: String(body.attendantName ?? "").trim() || null } : bus) };
      } else if (action === "updateStudent") {
        next = {
          ...current,
          students: current.students.map((student) => student.id === Number(body.id) ? { ...student, name: String(body.name), grade: Number(body.grade), class_name: String(body.className) } : student),
          assignments: current.assignments.map((assignment) => assignment.id === Number(body.assignmentId) ? { ...assignment, stop_name: String(body.stopName ?? "").trim() || null } : assignment),
        };
      } else if (action === "moveAssignment") {
        next = { ...current, assignments: current.assignments.map((assignment) => assignment.id === Number(body.assignmentId) ? { ...assignment, bus_id: Number(body.busId), boarding_order: 0 } : assignment) };
      } else if (action === "deleteAssignment") {
        next = { ...current, assignments: current.assignments.filter((assignment) => assignment.id !== Number(body.assignmentId)) };
      } else if (action === "deleteBusAssignments") {
        next = { ...current, assignments: current.assignments.filter((assignment) => assignment.bus_id !== Number(body.busId)) };
      } else if (action === "deleteAllStudents") {
        next = { ...current, students: [], assignments: [] };
      }
      const counts = new Map<number, number>();
      const today = localDate();
      next.assignments.filter((assignment) => assignment.start_date <= today && assignment.end_date >= today).forEach((assignment) => counts.set(assignment.bus_id, (counts.get(assignment.bus_id) ?? 0) + 1));
      setLiveBuses(next.buses.map((bus) => ({ id: bus.id, label: `${bus.bus_number}호차`, plate: maskPlate(bus.plate_number), driver: maskName(bus.driver_name), attendant: maskName(bus.attendant_name) || "-", students: counts.get(bus.id) ?? 0 })));
      return next;
    });
    return true;
  }

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const endpoint = needsSetup ? "/api/auth/setup" : "/api/auth/login";
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(authForm) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setAuthError(result.error ?? "로그인하지 못했습니다."); setAuthBusy(false); return; }
    await loadBootstrap();
    setAuthBusy(false);
  }

  async function submitOperationLogin(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const response = await fetch("/api/auth/operation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: operationCode }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setAuthError(result.error ?? "운행 코드로 로그인하지 못했습니다."); setAuthBusy(false); return; }
    await loadBootstrap();
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
    await loadBootstrap();
    setView("log");
    setAuthBusy(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null);
    setSchoolData(null);
    setStudents(emptyStudents);
    runCache.current.clear();
    setView("log");
    setEntryMode("choose");
    setOperationCode("");
  }

  async function saveRun() {
    if (excludedReason) { setDataMessage("자동 제외일은 운행일지를 저장하지 않습니다."); return; }
    setDataBusy(true);
    setDataMessage("운행일지를 저장 중입니다…");
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ busId, date: selectedDate, status: runStatus, reason: runStatus === "not_operated" ? runReason : "", boarding: runStatus === "operated" ? students.map((student) => ({ studentId: student.id, boarded: student.boarded, note: student.note })) : [] }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) { setDataMessage(`운행일지 저장 실패: ${result.error ?? "서버에서 저장하지 못했습니다."}`); return; }
      runCache.current.set(`${busId}:${selectedDate}`, { run: { status: runStatus, reason: runStatus === "not_operated" ? runReason : "" }, boarding: runStatus === "operated" ? students.map((student) => ({ student_id: student.id, boarded: student.boarded ? 1 : 0, note: student.note })) : [] });
      setSaved(true);
      setDataMessage("운행일지가 정상적으로 저장되었습니다.");
    } catch {
      setDataMessage("운행일지 저장 실패: 서버와 통신하지 못했습니다. 인터넷 연결을 확인하세요.");
    } finally {
      setDataBusy(false);
    }
  }

  async function saveInspection(status: "draft" | "complete" = "draft") {
    if (!inspectionGroupId) { setDataMessage("저장할 점검 세트를 선택하세요."); return; }
    setDataBusy(true);
    setDataMessage(status === "complete" ? "점검표를 완료 처리 중입니다…" : "점검표를 임시 저장 중입니다…");
    try {
      const response = await fetch("/api/inspections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ month: inspectionMonth, groupId: inspectionGroupId, status, answers: Object.entries(answers).map(([itemCode, answer]) => ({ itemCode, answer: answer === "예" ? "yes" : answer === "아니요" ? "no" : "not_applicable" })) }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      setDataMessage(response.ok ? "안전 점검표가 저장되었습니다." : `안전 점검표 저장 실패: ${result.error ?? "서버에서 저장하지 못했습니다."}`);
    } catch {
      setDataMessage("안전 점검표 저장 실패: 서버와 통신하지 못했습니다.");
    } finally {
      setDataBusy(false);
    }
  }

  async function adminAction(body: Record<string, unknown>, successMessage: string) {
    const action = String(body.action ?? "save");
    const progress = action === "updateStudent" ? "학생 정보를 수정" : action.includes("delete") ? "삭제" : action.includes("move") || action.includes("reassign") ? "학생 배정을 변경" : "저장";
    setDataBusy(true);
    setDataMessage(`${progress} 중입니다…`);
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      setDataMessage(response.ok ? successMessage : result.error ?? `${progress}하지 못했습니다.`);
      if (response.ok) {
        if (["addStudent", "addStudentAndAssign", "updateStudent", "moveAssignment", "deleteAssignment", "deleteBusAssignments", "deleteAllStudents"].includes(action)) runCache.current.clear();
        const updatedLocally = applyLocalDataChange(body);
        if (!updatedLocally) {
          if (managementLoaded) await loadManagementData(); else await loadSchoolData();
        } else if (managementLoaded && ["saveGroupBuses", "addGroup", "deleteGroup", "updateChecklistItem"].includes(action)) await loadManagementData();
      }
      return response.ok;
    } catch {
      setDataMessage("서버와 통신하지 못했습니다. 잠시 후 다시 시도하세요.");
      return false;
    } finally {
      setDataBusy(false);
    }
  }

  async function issueOperationCode() {
    setDataBusy(true);
    setDataMessage("운행 코드를 발급 중입니다…");
    try {
      const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "issueOperationCode", ...accountForm }) });
      const result = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (!response.ok) { setDataMessage(`운행 코드 발급 실패: ${result.error ?? "서버에서 발급하지 못했습니다."}`); return; }
      setDataMessage(`운행 코드가 발급되었습니다: ${result.code} — 담당자에게 전달하세요.`);
      setAccountForm((current) => ({ ...current, displayName: "" }));
      if (managementLoaded) await loadManagementData();
    } catch {
      setDataMessage("운행 코드 발급 실패: 서버와 통신하지 못했습니다.");
    } finally {
      setDataBusy(false);
    }
  }

  async function importStudents(event: React.FormEvent) {
    event.preventDefault();
    if (!importFile) { setImportSucceeded(false); setImportMessage("업로드할 엑셀 파일을 선택하세요."); return; }
    const form = new FormData();
    form.set("file", importFile);
    form.set("startDate", importDates.startDate);
    form.set("endDate", importDates.endDate);
    setImportBusy(true);
    setImportSucceeded(false);
    setImportMessage("학생 정보를 등록하고 있습니다. 잠시만 기다려 주세요.");
    try {
      const response = await fetch("/api/students/import", { method: "POST", body: form });
      const result = await response.json().catch(() => ({})) as { error?: string; count?: number };
      if (!response.ok) {
        setImportMessage(result.error ?? "학생 일괄 등록에 실패했습니다. 잠시 후 다시 시도하세요.");
        return;
      }
      const message = `${result.count ?? 0}명의 학생을 일괄 등록했습니다.`;
      setImportSucceeded(true);
      setImportMessage(message);
      setDataMessage(message);
      setImportFile(null);
      await loadSchoolData();
    } catch {
      setImportMessage("서버와 통신하지 못했습니다. 인터넷 연결 후 다시 시도하세요.");
    } finally {
      setImportBusy(false);
    }
  }

  function renderExclusionSettingsCard() {
    return <form className="main-panel exclusion-settings" onSubmit={async (event) => {
      event.preventDefault();
      const ok = await adminAction({ action: "addExclusion", date: exclusionForm.date, kind: "discretionary_holiday", note: exclusionForm.note }, "재량휴업일을 추가했습니다.");
      if (ok) setExclusionForm((current) => ({ ...current, date: "" }));
    }}>
      <div className="panel-heading"><div><h2>재량휴업일·제외일</h2><p>등록한 날짜는 운행일지와 미운행 통계에서 자동 제외됩니다.</p></div></div>
      <div className="form-grid"><label>날짜<input type="date" value={exclusionForm.date} onChange={(event) => setExclusionForm((current) => ({ ...current, date: event.target.value }))} required /></label><label>사유<input value={exclusionForm.note} onChange={(event) => setExclusionForm((current) => ({ ...current, note: event.target.value }))} /></label></div>
      <div className="exclusion-list">{schoolData?.exclusions.map((item) => <div className="calendar-tag" key={item.id}><strong>{koreanDate(item.date)}</strong><span>{item.note ?? "제외일"}</span><button type="button" onClick={() => adminAction({ action: "deleteExclusion", id: item.id }, "제외일을 삭제했습니다.")}>삭제</button></div>)}</div>
      <div className="form-footer"><button>재량휴업일 저장</button></div>
    </form>;
  }

  function renderStudentEditor() {
    const matches = (schoolData?.students ?? []).filter((student) => student.name.includes(studentSearch.trim()));
    return <section className="main-panel student-editor">
      <div className="panel-heading"><div><h2>학생 정보 검색·수정</h2><p>이름을 검색한 뒤 수정 버튼을 눌러 학생 정보와 승차장소를 변경하세요.</p></div></div>
      <div className="student-search"><label>학생 이름 검색<input value={studentSearch} onChange={(event) => { setStudentSearch(event.target.value); setStudentEditForm((current) => ({ ...current, id: 0, assignmentId: 0 })); }} placeholder="예: 김시완" /></label>
        {studentSearch.trim() && <div className="student-search-results">{matches.map((student) => {
          const assignment = schoolData?.assignments.find((item) => item.student_id === student.id);
          const bus = liveBuses.find((item) => item.id === assignment?.bus_id);
          return <div key={student.id}><strong>{student.name} · {student.grade}학년 {student.class_name}</strong><span>{bus ? `${bus.label} · ${assignment?.stop_name ?? "승차장소 미등록"}` : "차량 미배정"}</span><button type="button" onClick={() => setStudentEditForm({ id: student.id, name: student.name, grade: student.grade, className: student.class_name, assignmentId: assignment?.id ?? 0, stopName: assignment?.stop_name ?? "" })}>수정</button></div>;
        })}{matches.length === 0 && <div><span>검색 결과가 없습니다.</span></div>}</div>}
      </div>
      {studentEditForm.id > 0 && <form className="form-grid student-edit-form" onSubmit={async (event) => { event.preventDefault(); const ok = await adminAction({ action: "updateStudent", ...studentEditForm }, "학생 정보와 승차장소를 수정했습니다."); if (ok) setStudentEditForm((current) => ({ ...current, id: 0, assignmentId: 0 })); }}><label>이름<input value={studentEditForm.name} onChange={(event) => setStudentEditForm((current) => ({ ...current, name: event.target.value }))} /></label><label>학년<select value={studentEditForm.grade} onChange={(event) => setStudentEditForm((current) => ({ ...current, grade: Number(event.target.value) }))}>{[1,2,3,4,5,6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label><label>반<input value={studentEditForm.className} onChange={(event) => setStudentEditForm((current) => ({ ...current, className: event.target.value }))} /></label><label>승차장소<input value={studentEditForm.stopName} onChange={(event) => setStudentEditForm((current) => ({ ...current, stopName: event.target.value }))} placeholder="예: GS편의점" /></label><div className="student-editor-actions"><button type="button" className="secondary-button" onClick={() => setStudentEditForm((current) => ({ ...current, id: 0, assignmentId: 0 }))}>취소</button><button className="student-save-button" disabled={dataBusy}>{dataBusy ? "수정 중…" : "학생 정보 수정"}</button></div></form>}
    </section>;
  }

  function groupLabel(group: ApiGroup) {
    const busNumbers = schoolData?.groupBuses.filter((item) => item.group_id === group.id).map((item) => schoolData.buses.find((bus) => bus.id === item.bus_id)?.bus_number).filter((value): value is number => Boolean(value)) ?? [];
    return `${group.name} (${busNumbers.map((number) => `${number}호차`).join(" · ") || "차량 미지정"})`;
  }

  function toggleBoarding(id: number) {
    const selected = students.find((student) => student.id === id);
    if (!selected) return;
    const boarded = !selected.boarded;
    setSaved(false);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, boarded } : student));
    setDataMessage(`${selected.name} 학생을 ${boarded ? "탑승" : "미탑승"}으로 변경했습니다. 저장 버튼을 눌러야 반영됩니다.`);
  }

  function selectAllBoarding(boarded: boolean) {
    setSaved(false);
    setStudents((current) => current.map((student) => ({ ...student, boarded })));
    setDataMessage(boarded ? "전체 학생을 탑승으로 선택했습니다. 저장 버튼을 눌러야 반영됩니다." : "전체 학생을 미탑승으로 해제했습니다. 저장 버튼을 눌러야 반영됩니다.");
  }

  function updateNote(id: number, note: string) {
    setSaved(false);
    setStudents((current) => current.map((student) => student.id === id ? { ...student, note } : student));
    setDataMessage("학생 비고를 변경했습니다. 저장 버튼을 눌러야 반영됩니다.");
  }

  function cancelRunChanges() {
    if (!schoolData) return;
    const rows = buildRunStudents(schoolData, busId, selectedDate);
    const cached = runCache.current.get(`${busId}:${selectedDate}`);
    setRunStatus(cached?.run?.status ?? "operated");
    setRunReason(cached?.run?.reason ?? "");
    setStudents(rows.map((student) => {
      const record = cached?.boarding.find((item) => item.student_id === student.id);
      return record ? { ...student, boarded: Boolean(record.boarded), note: record.note ?? "" } : student;
    }));
    setSaved(Boolean(cached?.run));
    setDataMessage(cached?.run ? "저장 전 변경사항을 취소하고 마지막 저장 상태로 되돌렸습니다." : "입력한 내용을 취소하고 기본 탑승 상태로 되돌렸습니다.");
  }

  async function reorderRunStudents(sourceId: number, targetId: number) {
    if (sourceId === targetId || dataBusy) return;
    const previous = [...students];
    const sourceIndex = previous.findIndex((student) => student.id === sourceId);
    const targetIndex = previous.findIndex((student) => student.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...previous];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setStudents(next);
    setDataBusy(true);
    setDataMessage("학생 탑승 순서를 저장 중입니다…");
    try {
      const response = await fetch("/api/runs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ busId, date: selectedDate, assignmentIds: next.map((student) => student.assignmentId) }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setStudents(previous);
        setDataMessage(`탑승 순서 저장 실패: ${result.error ?? "서버에서 저장하지 못했습니다."}`);
        return;
      }
      const orderByAssignment = new Map(next.map((student, index) => [student.assignmentId, index + 1]));
      setSchoolData((current) => current ? { ...current, assignments: current.assignments.map((assignment) => orderByAssignment.has(assignment.id) ? { ...assignment, boarding_order: orderByAssignment.get(assignment.id) } : assignment) } : current);
      setDataMessage("학생 탑승 순서가 저장되었습니다.");
    } catch {
      setStudents(previous);
      setDataMessage("탑승 순서 저장 실패: 서버와 통신하지 못했습니다.");
    } finally {
      setDataBusy(false);
    }
  }

  async function reorderDirectoryStudents(selectedBusId: number, sourceId: number, targetId: number) {
    if (!schoolData || sourceId === targetId || dataBusy) return;
    const today = localDate();
    const currentRows = buildRunStudents(schoolData, selectedBusId, today);
    const sourceIndex = currentRows.findIndex((student) => student.id === sourceId);
    const targetIndex = currentRows.findIndex((student) => student.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const nextRows = [...currentRows];
    const [moved] = nextRows.splice(sourceIndex, 1);
    nextRows.splice(targetIndex, 0, moved);
    const previousData = schoolData;
    const orderByAssignment = new Map(nextRows.map((student, index) => [student.assignmentId, index + 1]));
    setSchoolData({ ...schoolData, assignments: schoolData.assignments.map((assignment) => orderByAssignment.has(assignment.id) ? { ...assignment, boarding_order: orderByAssignment.get(assignment.id) } : assignment) });
    setDataBusy(true);
    setDataMessage("호차별 학생 순서를 저장 중입니다…");
    try {
      const response = await fetch("/api/runs", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ busId: selectedBusId, date: today, assignmentIds: nextRows.map((student) => student.assignmentId) }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setSchoolData(previousData);
        setDataMessage(`호차별 학생 순서 저장 실패: ${result.error ?? "서버에서 저장하지 못했습니다."}`);
        return;
      }
      runCache.current.clear();
      setDataMessage("호차별 학생 순서가 저장되었으며 오늘의 운행일지에도 반영됩니다.");
    } catch {
      setSchoolData(previousData);
      setDataMessage("호차별 학생 순서 저장 실패: 서버와 통신하지 못했습니다.");
    } finally {
      setDataBusy(false);
    }
  }

  if (authUser === undefined) return <main className="auth-screen"><div className="auth-card loading"><div className="brand-mark">안전</div><p>통학버스 안전일지를 준비하고 있습니다.</p></div></main>;

  if (!authUser) return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark">안전</div><div><strong>와석초등 통학버스</strong><span>관리 플랫폼</span></div></div>
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
          <div><strong>와석초등 통학버스</strong><span>관리 플랫폼</span></div>
        </div>
        <nav aria-label="주요 메뉴">
          <NavButton active={view === "log"} onClick={() => setView("log")}>오늘의 운행일지</NavButton>
          {authUser.role === "admin" && <NavButton active={view === "stats"} onClick={() => setView("stats")}>미운행 통계</NavButton>}
          <NavButton active={view === "checklist"} onClick={() => setView("checklist")}>안전 점검 체크리스트</NavButton>
          {authUser.role === "admin" && <NavButton active={view === "settings"} onClick={() => setView("settings")}>통학버스 관리</NavButton>}
        </nav>
        <div className="sidebar-note"><span>운행 기간</span><strong>{settingsForm.startDate.replaceAll("-", ". ")} — {settingsForm.endDate.replaceAll("-", ". ")}</strong><small>공휴일 자동 제외 · 재량휴업일 {schoolData?.exclusions.length ?? 0}일</small></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><span className="eyebrow">{settingsForm.schoolYear}학년도 · {selectedDate >= settingsForm.semester2StartDate && selectedDate <= settingsForm.semester2EndDate ? "2학기" : "1학기"}</span><h1>{view === "log" ? "오늘의 운행일지" : view === "stats" ? "미운행 통계" : view === "checklist" ? "안전 점검 체크리스트" : "통학버스 관리"}</h1></div>
          <div className="account-area"><div className="today"><span>{authUser.demo ? "읽기 전용 체험" : authUser.role === "admin" ? "업무담당자" : authUser.role === "driver" ? "운전자" : "동승자"}</span><strong>{authUser.display_name ?? authUser.username}</strong></div><button onClick={logout}>{authUser.demo ? "체험 종료" : "로그아웃"}</button></div>
        </header>
        {dataMessage && <div className={`action-message ${dataBusy ? "working" : /실패|못했습니다|오류/.test(dataMessage) ? "error" : ""}`} role="status" aria-live="polite">{dataBusy && <span className="loading-dot" />} {dataMessage}</div>}
        {authUser.demo && <div className="demo-banner"><strong>체험 모드</strong><span>샘플 데이터로 화면을 둘러보는 중입니다. 입력 내용은 실제로 저장되지 않습니다.</span></div>}

        {view === "log" && (
          <div className="content-grid">
            <section className="main-panel">
              <div className="control-row">
                <label>운행일<input type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setSaved(false); setDataMessage("선택한 날짜의 운행일지를 불러오는 중입니다…"); }} /></label>
                <label>차량<select value={busId} onChange={(event) => { setBusId(Number(event.target.value)); setSaved(false); setDataMessage("선택한 차량의 운행일지를 불러오는 중입니다…"); }}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label} · {bus.plate}</option>)}</select></label>
                <div className="driver-chip"><span>운전자</span><strong>{selectedBus.driver}</strong></div>
                <div className="driver-chip"><span>동승자</span><strong>{selectedBus.attendant}</strong></div>
              </div>
              <div className={excludedReason ? "run-status excluded" : "run-status"}><div><span className="status-dot" />{excludedReason ? "자동 제외일" : runStatus === "operated" ? "정상 운행" : "차량 미운행"}</div><p>{excludedReason ? `${excludedReason} — 운행일지 작성 대상에서 제외됩니다.` : "대한민국 공휴일과 등록된 재량휴업일은 자동으로 일지에서 제외됩니다."}</p>{!excludedReason && <div className="run-toggle"><button className={runStatus === "operated" ? "active" : ""} onClick={() => { setRunStatus("operated"); setSaved(false); setDataMessage("정상 운행으로 변경했습니다. 저장 버튼을 눌러야 반영됩니다."); }}>정상 운행</button><button className={runStatus === "not_operated" ? "active warning" : ""} onClick={() => { setRunStatus("not_operated"); setSaved(false); setDataMessage("미운행으로 변경했습니다. 사유를 입력한 뒤 저장하세요."); }}>미운행</button></div>}</div>
              {runStatus === "not_operated" && !excludedReason && <div className="not-running-reason"><label>미운행 사유<input value={runReason} onChange={(event) => { setRunReason(event.target.value); setSaved(false); setDataMessage("미운행 사유를 변경했습니다. 저장 버튼을 눌러야 반영됩니다."); }} placeholder="예: 차량 정비, 운전자 사정" /></label></div>}
              <div className="panel-heading"><div><h2>{selectedBus.label} 등교 탑승 명단</h2><p>탑승장소 순으로 표시됩니다. 학생 행을 끌어 놓으면 순서를 조정할 수 있습니다.</p></div><div className="boarding-tools"><div className="bulk-boarding-actions"><button type="button" onClick={() => selectAllBoarding(true)} disabled={!students.length || dataBusy}>전체 선택</button><button type="button" onClick={() => selectAllBoarding(false)} disabled={!students.length || dataBusy}>전체 해제</button></div><div className="count"><strong>{boardedCount}</strong><span>/ {students.length}명 탑승</span></div></div></div>
              {runStatus === "operated" && <div className="student-list">
                {students.length === 0 && <div className="empty-state"><strong>이 날짜에 배정된 학생이 없습니다.</strong><span>관리자 설정에서 학생과 차량 배정 기간을 등록하세요.</span></div>}
                {students.map((student) => (
                  <div className="student-row" key={student.id} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const sourceId = Number(event.dataTransfer.getData("runStudentId")); if (sourceId) void reorderRunStudents(sourceId, student.id); }}>
                    <span className="drag-handle" draggable={!dataBusy} role="button" tabIndex={0} title="끌어서 순서 변경" aria-label={`${student.name} 순서 변경. 위아래 방향키 사용 가능`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("runStudentId", String(student.id)); }} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); const index = students.findIndex((item) => item.id === student.id); const target = students[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) void reorderRunStudents(student.id, target.id); }}>⋮⋮</span>
                    <button className={student.boarded ? "boarding checked" : "boarding"} onClick={() => toggleBoarding(student.id)} aria-label={`${student.name} 탑승 여부`}>{student.boarded ? "✓" : "–"}</button>
                    <div className="student-info"><strong>{student.name}</strong><span>{student.detail}</span></div>
                    <span className={student.boarded ? "badge boarded" : "badge absent"}>{student.boarded ? "탑승" : "미탑승"}</span>
                    <input aria-label={`${student.name} 비고`} value={student.note} onChange={(event) => updateNote(student.id, event.target.value)} placeholder="비고 입력" />
                  </div>
                ))}
              </div>}
              <div className="save-bar"><span>{dataBusy ? "처리 중입니다. 잠시만 기다려 주세요." : saved ? "현재 내용은 저장된 상태입니다." : excludedReason ? "제외일은 미운행 날짜에 자동 포함됩니다." : "저장하지 않은 변경사항이 있습니다."}</span><div className="save-actions"><button type="button" className="secondary-save" onClick={cancelRunChanges} disabled={Boolean(excludedReason) || dataBusy}>변경 취소</button><button onClick={saveRun} disabled={Boolean(excludedReason) || dataBusy}>{excludedReason ? "자동 제외일" : dataBusy ? "저장 중…" : runStatus === "operated" ? "운행일지 저장" : "미운행 저장"}</button></div></div>
            </section>

            <aside className="summary-panel">
              <div className="summary-card dark"><span>관리 차량</span><strong>{liveBuses.length}대</strong><p>등교버스만 표시됩니다</p><div className="progress"><i style={{ width: "100%" }} /></div></div>
              <div className="summary-card"><span>빠른 확인</span><dl><div><dt>현재 배정 학생</dt><dd>{students.length}명</dd></div><div><dt>미탑승 학생</dt><dd>{students.length - boardedCount}명</dd></div><div><dt>비고 작성</dt><dd>{students.filter((student) => student.note).length}건</dd></div></dl></div>
              <div className="summary-card holiday"><span>다가오는 법정 공휴일</span><strong>{nextHoliday ? `${Number(nextHoliday.date.slice(5, 7))}월 ${Number(nextHoliday.date.slice(8, 10))}일` : "자료 없음"}</strong><p>{nextHoliday?.names.join(", ") ?? "학사일정에서 제외일을 확인하세요"}</p></div>
            </aside>
          </div>
        )}

        {view === "stats" && <StatisticsView month={statisticsMonth} statistics={statistics} rows={statisticRows} students={schoolData?.students ?? []} absences={studentAbsences} selectedStudent={selectedAbsenceStudent} onMonthChange={setStatisticsMonth} onStudentChange={setSelectedAbsenceStudent} />}

        {view === "checklist" && <ChecklistView month={inspectionMonth} groupId={inspectionGroupId} groupOptions={(schoolData?.groups ?? []).map((group) => ({ id: group.id, label: groupLabel(group) }))} groups={inspectionGroups} answers={answers} role={authUser.role} dataMessage={dataMessage} itemCount={checklistItems.length} onMonthChange={setInspectionMonth} onGroupChange={setInspectionGroupId} onAnswer={(code, answer) => setAnswers((current) => ({ ...current, [code]: answer }))} onSave={(status) => void saveInspection(status)} />}

        {view === "settings" && (
          <section className={`settings-page ${settingsSection}`}>
            {settingsSection === "calendar" && renderExclusionSettingsCard()}
            {settingsSection === "students" && renderStudentEditor()}
            <div className="settings-subnav"><button className={settingsSection === "calendar" ? "active" : ""} onClick={() => setSettingsSection("calendar")}>운행일 설정</button><button className={settingsSection === "buses" ? "active" : ""} onClick={() => setSettingsSection("buses")}>차량 정보</button><button className={settingsSection === "students" ? "active" : ""} onClick={() => setSettingsSection("students")}>학생 등록</button><button className={settingsSection === "codes" ? "active" : ""} onClick={() => setSettingsSection("codes")}>운행코드·점검 세트</button><button className={settingsSection === "checklist" ? "active" : ""} onClick={() => setSettingsSection("checklist")}>점검 항목</button></div>
            {settingsSection === "students" && <button className="secondary-button csv-download" onClick={() => downloadCsv("학생명단.csv", [["이름", "학년", "반", "호차", "승차장소"], ...(schoolData?.assignments.flatMap((assignment) => { const student = schoolData.students.find((item) => item.id === assignment.student_id); const bus = schoolData.buses.find((item) => item.id === assignment.bus_id); return student && bus ? [[student.name, String(student.grade), student.class_name, `${bus.bus_number}호차`, assignment.stop_name ?? ""]] : []; }) ?? [])])}>학생명단 CSV 내보내기</button>}
            {settingsSection === "buses" && <div className="main-panel assigned-students"><div className="panel-heading"><div><h2>{liveBuses.find((bus) => bus.id === settingsBusId)?.label ?? "선택 차량"} 배정 학생</h2><p>오늘 유효한 배정만 표시하며 오늘의 운행일지 명단과 동일합니다.</p></div></div>{schoolData && buildRunStudents(schoolData, settingsBusId, localDate()).map((student) => <div className="assigned-student-row" key={student.assignmentId}><strong>{student.name}</strong><span>{student.detail}</span><small>오늘 운행 대상</small></div>)}</div>}
            {settingsSection === "students" && <form className="main-panel import-panel" onSubmit={importStudents}><div className="panel-heading"><div><h2>엑셀 학생 일괄등록</h2><p>양식을 내려받아 작성한 뒤 업로드하세요. 배정 시작일과 종료일은 모든 행에 동일하게 적용됩니다.</p></div><a className="secondary-button" href="/api/students/template">양식 다운로드</a></div><div className="form-grid"><label className="span-two">학생등록 엑셀 파일<input type="file" accept=".xlsx" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportMessage(""); setImportSucceeded(false); }} />{importFile && <small className="selected-file">선택한 파일: {importFile.name}</small>}</label><label>배정 시작일<input type="date" value={importDates.startDate} onChange={(event) => setImportDates((current) => ({ ...current, startDate: event.target.value }))} /></label><label>배정 종료일<input type="date" value={importDates.endDate} onChange={(event) => setImportDates((current) => ({ ...current, endDate: event.target.value }))} /></label></div>{importMessage && <p className={`import-message ${importSucceeded ? "success" : ""}`} role="status">{importMessage}</p>}<div className="form-footer"><button disabled={importBusy}>{importBusy ? "학생 등록 중…" : "학생 일괄 등록"}</button></div></form>}
            {settingsSection === "students" && <section className="main-panel student-directory">
              <div className="panel-heading"><div><h2>학생·호차별 배정 현황</h2><p>오늘 유효한 배정만 표시합니다. 같은 호차 안에서 끌어 순서를 바꾸거나 다른 호차로 옮길 수 있습니다.</p></div><button type="button" className="danger-button" onClick={() => { if (window.confirm("학생 명단과 모든 차량 배정을 삭제할까요? 운행 기록은 보존됩니다.")) adminAction({ action: "deleteAllStudents" }, "전체 학생 명단과 차량 배정을 삭제했습니다."); }}>전체 학생 삭제</button></div>
              <div className="bus-student-overview">{liveBuses.map((bus) => {
                const directoryStudents = schoolData ? buildRunStudents(schoolData, bus.id, localDate()) : [];
                const allBusAssignments = (schoolData?.assignments ?? []).filter((assignment) => assignment.bus_id === bus.id);
                return <div className="bus-student-card" key={bus.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  const assignmentId = Number(event.dataTransfer.getData("assignmentId"));
                  const sourceBusId = Number(event.dataTransfer.getData("sourceBusId"));
                  if (assignmentId && sourceBusId !== bus.id) adminAction({ action: "moveAssignment", assignmentId, busId: bus.id }, `${bus.label}로 학생 배정을 옮겼습니다.`);
                }}>
                  <div className="bus-student-card-header"><strong>{bus.label} · {directoryStudents.length}명</strong><button type="button" className="danger-button" onClick={() => { if (allBusAssignments.length && window.confirm(`${bus.label}의 현재·예정 학생 ${allBusAssignments.length}명 배정을 모두 삭제할까요?`)) adminAction({ action: "deleteBusAssignments", busId: bus.id }, `${bus.label}의 학생 배정을 모두 삭제했습니다.`); }}>호차 배정 전체 삭제</button></div>
                  {directoryStudents.length === 0 && <span className="empty-bus-students">오늘 배정 학생 없음</span>}
                  {directoryStudents.map((student) => <div className="assigned-student-name" key={student.assignmentId} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const assignmentId = Number(event.dataTransfer.getData("assignmentId"));
                    const sourceBusId = Number(event.dataTransfer.getData("sourceBusId"));
                    const sourceStudentId = Number(event.dataTransfer.getData("directoryStudentId"));
                    if (sourceBusId === bus.id && sourceStudentId) void reorderDirectoryStudents(bus.id, sourceStudentId, student.id);
                    else if (assignmentId) adminAction({ action: "moveAssignment", assignmentId, busId: bus.id }, `${bus.label}로 학생 배정을 옮겼습니다.`);
                  }}>
                    <span className="drag-handle" draggable={!dataBusy} role="button" tabIndex={0} title="끌어서 순서 변경" aria-label={`${student.name} 순서 변경. 위아래 방향키 사용 가능`} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("assignmentId", String(student.assignmentId)); event.dataTransfer.setData("sourceBusId", String(bus.id)); event.dataTransfer.setData("directoryStudentId", String(student.id)); }} onKeyDown={(event) => { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); const index = directoryStudents.findIndex((item) => item.id === student.id); const target = directoryStudents[index + (event.key === "ArrowUp" ? -1 : 1)]; if (target) void reorderDirectoryStudents(bus.id, student.id, target.id); }}>⋮⋮</span>
                    <span className="assigned-student-main"><b>{student.name}</b><small>{student.detail}</small></span>
                    <button type="button" onClick={() => { if (window.confirm(`${student.name} 학생의 ${bus.label} 배정을 삭제할까요?`)) adminAction({ action: "deleteAssignment", assignmentId: student.assignmentId }, `${student.name} 학생의 차량 배정을 삭제했습니다.`); }}>삭제</button>
                  </div>)}
                </div>;
              })}</div>
              {(schoolData?.assignments ?? []).some((assignment) => assignment.start_date > localDate()) && <div className="upcoming-assignments"><div><strong>배정 시작 전 학생</strong><span>시작일이 되면 위 호차별 현황과 오늘의 운행일지에 자동 표시됩니다.</span></div>{schoolData?.assignments.filter((assignment) => assignment.start_date > localDate()).sort((a, b) => a.start_date.localeCompare(b.start_date)).map((assignment) => { const student = schoolData.students.find((item) => item.id === assignment.student_id); const bus = schoolData.buses.find((item) => item.id === assignment.bus_id); return student && bus ? <div className="upcoming-assignment-row" key={assignment.id}><b>{student.name} · {student.grade}학년 {student.class_name}</b><span>{bus.bus_number}호차 · {assignment.start_date}부터 · {assignment.stop_name || "승차장소 미등록"}</span></div> : null; })}</div>}
            </section>}
            {settingsSection === "calendar" && <form className="main-panel semester-settings" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "saveSettings", ...settingsForm }, "학년도와 학기 기간을 저장했습니다."); }}><div className="panel-heading"><div><h2>학년도와 학기 기간</h2><p>학생 배정과 운행 관리에 사용할 기간을 직접 설정하세요.</p></div></div><div className="form-grid"><label>학년도<input type="number" value={settingsForm.schoolYear} onChange={(event) => setSettingsForm((current) => ({ ...current, schoolYear: Number(event.target.value) }))} /></label><label>전체 운행 시작일<input type="date" value={settingsForm.startDate} onChange={(event) => setSettingsForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>전체 운행 종료일<input type="date" value={settingsForm.endDate} onChange={(event) => setSettingsForm((current) => ({ ...current, endDate: event.target.value }))} /></label><label>1학기 시작일<input type="date" value={settingsForm.semester1StartDate} onChange={(event) => setSettingsForm((current) => ({ ...current, semester1StartDate: event.target.value }))} /></label><label>1학기 종료일<input type="date" value={settingsForm.semester1EndDate} onChange={(event) => setSettingsForm((current) => ({ ...current, semester1EndDate: event.target.value }))} /></label><label>2학기 시작일<input type="date" value={settingsForm.semester2StartDate} onChange={(event) => setSettingsForm((current) => ({ ...current, semester2StartDate: event.target.value }))} /></label><label>2학기 종료일<input type="date" value={settingsForm.semester2EndDate} onChange={(event) => setSettingsForm((current) => ({ ...current, semester2EndDate: event.target.value }))} /></label></div><div className="form-footer"><button>학기 기간 저장</button></div></form>}
            {settingsSection === "codes" && <section className="main-panel staff-picker"><div className="panel-heading"><div><h2>등록 운전자·동승자 선택</h2><p>차량정보에 입력된 담당자를 선택하면 코드 발급 양식에 자동 입력됩니다. 같은 담당자를 여러 차량에 반복 선택할 수 있습니다.</p></div><select defaultValue="" onChange={(event) => { const [role, ...name] = event.target.value.split(":"); if (name.length) setAccountForm((current) => ({ ...current, role: role as "driver" | "attendant", displayName: name.join(":") })); }}><option value="">직접 입력 또는 담당자 선택</option>{operationPeople.map((person) => <option key={`${person.role}:${person.name}`} value={`${person.role}:${person.name}`}>{person.name} · {person.role === "driver" ? "운전자" : "동승자"}</option>)}</select></div></section>}
            <div className="settings-grid">
              <div className="main-panel"><div className="panel-heading"><div><h2>차량 정보</h2><p>원본은 안전하게 저장하고, 목록에서는 차량번호와 운전자명을 가립니다.</p></div><span className="eyebrow">총 {liveBuses.length}대</span></div><div className="bus-table"><div className="table-head"><span>차량</span><span>차량번호</span><span>운전자</span><span>배정 학생</span></div>{liveBuses.map((bus) => <button className={settingsBusId === bus.id ? "table-row selected-row" : "table-row"} key={bus.id} onClick={() => setSettingsBusId(bus.id)}><strong>{bus.label}</strong><span>{bus.plate}</span><span>{bus.driver}</span><span>{bus.students}명</span></button>)}</div></div>
              <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "saveBus", id: settingsBusId, ...busForm }, "차량 정보가 저장되었습니다."); }}><span>선택 차량 수정</span><label>차량번호<input value={busForm.plateNumber} onChange={(event) => setBusForm((current) => ({ ...current, plateNumber: event.target.value }))} placeholder="예: 78가 1234" /></label><label>운전자 성명<input value={busForm.driverName} onChange={(event) => setBusForm((current) => ({ ...current, driverName: event.target.value }))} /></label><label>동승자 성명<input value={busForm.attendantName} onChange={(event) => setBusForm((current) => ({ ...current, attendantName: event.target.value }))} /></label><button className="primary-full">차량 정보 저장</button></form>
            </div>

            <div className="settings-grid settings-lower student-settings">
              <div className="main-panel settings-form-panel"><form onSubmit={async (event) => { event.preventDefault(); const ok = await adminAction({ action: "addStudentAndAssign", ...studentForm }, "학생을 등록하고 차량에 배정했습니다."); if (ok) setStudentForm((current) => ({ ...current, name: "", stopName: "" })); }}><div className="panel-heading"><div><h2>학생 등록 및 차량 배정</h2><p>배정 기간은 오늘이 포함된 학기 기간으로 자동 적용됩니다.</p></div></div><div className="form-grid"><label>학생 이름<input value={studentForm.name} onChange={(event) => setStudentForm((current) => ({ ...current, name: event.target.value }))} required /></label><label>학년<select value={studentForm.grade} onChange={(event) => setStudentForm((current) => ({ ...current, grade: Number(event.target.value) }))}>{[1,2,3,4,5,6].map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}</select></label><label>반<input value={studentForm.className} onChange={(event) => setStudentForm((current) => ({ ...current, className: event.target.value }))} /></label><label>등교 차량<select value={studentForm.busId} onChange={(event) => setStudentForm((current) => ({ ...current, busId: Number(event.target.value) }))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label}</option>)}</select></label><label className="span-two">승차 정류장<input value={studentForm.stopName} onChange={(event) => setStudentForm((current) => ({ ...current, stopName: event.target.value }))} /></label></div><div className="form-footer"><button>학생 등록 및 배정</button></div></form></div>
            </div>

            <div className="settings-grid settings-lower">
              <form className="main-panel settings-form-panel" onSubmit={async (event) => { event.preventDefault(); await issueOperationCode(); }}><div className="panel-heading"><div><h2>버스 운행 코드 발급</h2><p>운전자 또는 동승자에게 코드를 전달하면 담당 차량과 기간 내에서만 운행일지를 작성할 수 있습니다.</p></div></div><div className="form-grid"><label>수령자 이름<input required value={accountForm.displayName} onChange={(event) => setAccountForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="예: 홍길동" /></label><label>역할<select value={accountForm.role} onChange={(event) => setAccountForm((current) => ({ ...current, role: event.target.value as typeof current.role }))}><option value="driver">운전자</option><option value="attendant">동승자</option></select></label><label>담당 차량<select value={accountForm.busId} onChange={(event) => setAccountForm((current) => ({ ...current, busId: Number(event.target.value) }))}>{liveBuses.map((bus) => <option key={bus.id} value={bus.id}>{bus.label}</option>)}</select></label><label>유효 시작일<input type="date" value={accountForm.startDate} onChange={(event) => setAccountForm((current) => ({ ...current, startDate: event.target.value }))} /></label><label>유효 종료일<input type="date" value={accountForm.endDate} onChange={(event) => setAccountForm((current) => ({ ...current, endDate: event.target.value }))} /></label></div><div className="form-footer"><button>운행 코드 발급</button></div><div className="issued-code-list"><strong>발급된 코드</strong>{(schoolData?.users ?? []).filter((user) => user.role === "driver" || user.role === "attendant").map((user) => { const assignment = schoolData?.userBuses.find((item) => item.user_id === user.id); const assignedBus = schoolData?.buses.find((bus) => bus.id === assignment?.bus_id); return <div className="issued-code-row" key={user.id}><code>{user.username}</code><span>{user.display_name ?? "이름 없음"} · {user.role === "driver" ? "운전자" : "동승자"} · {assignedBus ? `${assignedBus.bus_number}호차` : "차량 미배정"}</span><small>{assignment ? `${assignment.start_date} ~ ${assignment.end_date}` : "기간 미설정"}</small></div>; })}</div></form>

              <form className="summary-card settings-card" onSubmit={async (event) => { event.preventDefault(); await adminAction({ action: "addGroup", name: groupForm.name }, "점검 세트를 추가했습니다."); }}><span>점검 세트 관리</span><label>세트 선택<select value={groupForm.groupId} onChange={(event) => { const groupId = Number(event.target.value); setGroupForm((current) => ({ ...current, groupId, busIds: schoolData?.groupBuses.filter((item) => item.group_id === groupId).map((item) => item.bus_id) ?? [] })); }}>{schoolData?.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="bus-check-grid">{liveBuses.map((bus) => <label key={bus.id}><input type="checkbox" checked={groupForm.busIds.includes(bus.id)} onChange={(event) => setGroupForm((current) => ({ ...current, busIds: event.target.checked ? [...current.busIds, bus.id] : current.busIds.filter((id) => id !== bus.id) }))} />{bus.label}</label>)}</div><button type="button" className="primary-full" onClick={() => adminAction({ action: "saveGroupBuses", groupId: groupForm.groupId, busIds: groupForm.busIds }, "점검 세트 차량 구성을 저장했습니다.")}>차량 묶음 저장</button><label>새 세트 이름<input value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} /></label><button className="secondary-button full">새 세트 추가</button><button type="button" className="danger-button" onClick={() => adminAction({ action: "deleteGroup", groupId: groupForm.groupId }, "점검 세트를 삭제했습니다.")}>선택 세트 삭제</button></form>
            </div>
            <div className="main-panel checklist-editor"><div className="panel-heading"><div><h2>점검 문구와 담당 역할</h2><p>원본 서식에 맞게 문구를 교정하고, 필요하면 운전자·동승자 담당 항목을 나눌 수 있습니다.</p></div><span className="eyebrow">{checklistItems.length}개 항목</span></div><div className="checklist-edit-list">{schoolData?.checklistItems.map((item) => { const draft = checklistDrafts[item.id] ?? { content: item.content, responsibleRole: item.responsible_role }; return <div className="checklist-edit-row" key={item.id}><span>{item.code}</span><strong>{item.category}</strong><input value={draft.content} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [item.id]: { ...draft, content: event.target.value } }))} /><select value={draft.responsibleRole} onChange={(event) => setChecklistDrafts((current) => ({ ...current, [item.id]: { ...draft, responsibleRole: event.target.value as typeof draft.responsibleRole } }))}><option value="all">공동 작성</option><option value="driver">운전자</option><option value="attendant">동승자</option></select><button onClick={() => adminAction({ action: "updateChecklistItem", id: item.id, content: draft.content, responsibleRole: draft.responsibleRole }, "점검 항목을 수정했습니다.")}>저장</button></div>; })}</div></div>
          </section>
        )}
      </section>
    </main>
  );
}
