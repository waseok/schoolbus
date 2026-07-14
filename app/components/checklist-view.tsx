"use client";

type Answer = "예" | "아니요" | "해당없음";
type ChecklistItem = { code: string; content: string; responsible_role: "all" | "driver" | "attendant" };

export default function ChecklistView({ month, groupId, groupOptions, groups, answers, role, dataMessage, itemCount, onMonthChange, onGroupChange, onAnswer, onSave }: {
  month: string;
  groupId: number | null;
  groupOptions: Array<{ id: number; label: string }>;
  groups: Array<{ title: string; items: ChecklistItem[] }>;
  answers: Record<string, Answer>;
  role: "admin" | "driver" | "attendant";
  dataMessage: string;
  itemCount: number;
  onMonthChange: (value: string) => void;
  onGroupChange: (value: number) => void;
  onAnswer: (code: string, answer: Answer) => void;
  onSave: (status: "draft" | "complete") => void;
}) {
  return <section className="main-panel wide checklist-panel">
    <div className="panel-heading"><div><span className="eyebrow">매월 제출</span><h2>안전 점검 체크리스트</h2><p>선택한 세트에 묶인 차량을 한 번에 점검합니다.</p></div><div className="inspection-controls"><input type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} /><select value={groupId ?? ""} onChange={(event) => onGroupChange(Number(event.target.value))}>{groupOptions.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select><button className="pdf-button" onClick={() => window.print()}>PDF 내보내기</button><div className="completion"><strong>{Object.keys(answers).length}</strong><span>/ {itemCount} 완료</span></div></div></div>
    {groups.map((group) => <div className="check-group" key={group.title}><h3>{group.title}</h3>{group.items.map((item) => { const canEdit = role === "admin" || item.responsible_role === "all" || item.responsible_role === role; return <div className={canEdit ? "check-row" : "check-row read-only"} key={item.code}><span>{item.content}{item.responsible_role !== "all" && <small>{item.responsible_role === "driver" ? "운전자 담당" : "동승자 담당"}</small>}</span><div>{(["예", "아니요", "해당없음"] as const).map((answer) => <button key={answer} disabled={!canEdit} className={answers[item.code] === answer ? "answer active" : "answer"} onClick={() => onAnswer(item.code, answer)}>{answer}</button>)}</div></div>; })}</div>)}
    <div className="save-bar"><span>{dataMessage || "모든 항목 확인 후 완료 상태로 저장할 수 있습니다."}</span><div className="save-actions"><button className="secondary-save" onClick={() => onSave("draft")}>임시 저장</button><button onClick={() => onSave("complete")}>점검 완료</button></div></div>
  </section>;
}
