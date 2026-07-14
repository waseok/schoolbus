"use client";

type StatisticsData = {
  holidays: Array<{ date: string; names: string[] }>;
  exclusions: Array<{ date: string; kind: string; note: string | null }>;
  nonOperatingRuns: Array<{ bus_id: number; date: string; reason: string | null }>;
  buses: Array<{ id: number; bus_number: number }>;
};

type Student = { id: number; name: string; grade: number; class_name: string };
type AbsenceRecord = { name: string; grade: number; className: string; date: string; busNumber: number; note: string };
type StatisticRow = { bus: string; dates: Array<{ date: string; reason: string; type: string }> };

function koreanDate(date: string) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function StatisticsView({ month, statistics, rows, students, absences, selectedStudent, onMonthChange, onStudentChange }: {
  month: string;
  statistics: StatisticsData | null;
  rows: StatisticRow[];
  students: Student[];
  absences: { records: AbsenceRecord[] } | null;
  selectedStudent: string;
  onMonthChange: (value: string) => void;
  onStudentChange: (value: string) => void;
}) {
  const selectedRecords = (absences?.records ?? []).filter((record) => record.name === selectedStudent);
  return <section className="main-panel wide">
    <div className="panel-heading"><div><span className="eyebrow">안전 점검 사이트 입력용</span><h2>월별 미운행 날짜</h2><p>공휴일·재량휴업일과 실제 미운행 기록을 차량별로 모았습니다.</p></div><div className="export-actions"><a className="secondary-button" href={`/api/exports/runs?month=${month}`}>📥 운행일지 다운로드</a><button className="secondary-button" onClick={() => downloadCsv(`${month}_미운행통계.csv`, [["호차", "날짜", "사유"], ...rows.flatMap((row) => row.dates.map((item) => [row.bus, item.date, item.reason]))])}>📥 미운행 통계 다운로드</button><label className="month-control">조회 월<input type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} /></label></div></div>
    <div className="stats-summary"><div><span>운행 대상 차량</span><strong>{statistics?.buses.length ?? 0}대</strong></div><div><span>공통 미운행일</span><strong>{(statistics?.holidays.length ?? 0) + (statistics?.exclusions.length ?? 0)}일</strong></div><div><span>개별 미운행</span><strong>{statistics?.nonOperatingRuns.length ?? 0}건</strong></div></div>
    <div className="stats-list">{rows.map((row) => <div className="stats-row" key={row.bus}><strong>{row.bus}</strong><div>{row.dates.length ? row.dates.map((item) => <span className={`nonoperating-date ${item.type}`} key={`${item.date}-${item.reason}`}><b>{koreanDate(item.date)}</b><small>{item.reason}</small></span>) : <span>미운행 없음</span>}</div><small>{row.dates.length}일</small></div>)}</div>
    <div className="student-absence-panel"><h3>학생별 미탑승 통계</h3><p>학생을 선택하면 해당 학생의 미탑승일, 사유와 총 횟수를 확인합니다.</p><select value={selectedStudent} onChange={(event) => onStudentChange(event.target.value)}><option value="">학생 선택</option>{students.map((student) => <option key={student.id} value={student.name}>{student.name} · {student.grade}학년 {student.class_name}</option>)}</select>{selectedStudent && <><strong className="absence-total">{selectedStudent} · 총 {selectedRecords.length}일 미탑승</strong><div className="absence-table">{selectedRecords.map((record, index) => <div key={`${record.date}-${index}`}><strong>{koreanDate(record.date)} · {record.busNumber}호차</strong><small>{record.note}</small></div>)}{selectedRecords.length === 0 && <div className="empty-state"><strong>이 달의 미탑승 기록이 없습니다.</strong></div>}</div></>}{!selectedStudent && <div className="empty-state"><strong>학생을 선택하세요.</strong></div>}</div>
    <p className="prototype-note">공휴일과 재량휴업일은 모든 차량에 공통으로 포함되며, 차량별 미운행 기록이 추가됩니다.</p>
  </section>;
}
