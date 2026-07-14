import ExcelJS from "exceljs";
import { ensureDatabase, jsonError } from "../../../../db/runtime";
import { requireUser } from "../../../auth";

export const runtime = "nodejs";

type ImportRow = { name: string; grade: number; className: string; busNumber: number; stopName: string };
const headers = ["이름", "학년", "반", "차량번호", "승차장소"];

export async function POST(request: Request) {
  try {
    const user = await requireUser(request, ["admin"]);
    if (!user) return jsonError("관리자 권한이 필요합니다.", 403);
    if (user.demo) return jsonError("체험 모드에서는 실제 데이터를 저장하지 않습니다.", 403);
    const form = await request.formData();
    const uploadedFile = form.get("file");
    const startDate = String(form.get("startDate") ?? "");
    const endDate = String(form.get("endDate") ?? "");
    if (!uploadedFile || typeof uploadedFile === "string" || !("arrayBuffer" in uploadedFile) || uploadedFile.size === 0 || uploadedFile.size > 5 * 1024 * 1024) return jsonError("5MB 이하의 엑셀 파일을 선택하세요.");
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(startDate) || !/^20\d{2}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return jsonError("일괄 적용할 배정 기간을 확인하세요.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await uploadedFile.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return jsonError("학생등록 시트를 찾을 수 없습니다.");
    const actualHeaders = ((sheet.getRow(1).values ?? []) as ExcelJS.CellValue[]).slice(1).map((value) => String(value ?? "").trim());
    if (headers.some((header, index) => actualHeaders[index] !== header)) return jsonError("다운로드한 학생등록 양식의 열 이름과 순서를 유지하세요.");
    const rows: ImportRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const [name, grade, className, busNumber, stopName] = ((row.values ?? []) as ExcelJS.CellValue[]).slice(1).map((value) => String(value ?? "").trim());
      if (![name, grade, className, busNumber].some(Boolean)) return;
      rows.push({ name, grade: Number(grade), className, busNumber: Number(busNumber), stopName });
    });
    if (!rows.length || rows.length > 1000) return jsonError("1~1,000명의 학생만 한 번에 등록할 수 있습니다.");
    const invalid = rows.find((row) => !row.name || !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 6 || !row.className || !Number.isInteger(row.busNumber) || row.busNumber < 1);
    if (invalid) return jsonError("이름, 1~6학년, 반, 차량번호를 모두 정확히 입력하세요.");

    const db = await ensureDatabase();
    const { data: buses, error: busesError } = await db.from("buses").select("id, bus_number").eq("active", 1);
    if (busesError) return jsonError(`차량 정보를 확인하지 못했습니다: ${busesError.message}`, 500);
    const busByNumber = new Map((buses ?? []).map((bus) => [bus.bus_number, bus.id]));
    const missingBus = rows.find((row) => !busByNumber.has(row.busNumber));
    if (missingBus) return jsonError(`${missingBus.busNumber}호차는 등록된 차량이 아닙니다.`);
    const { data: created, error: studentError } = await db.from("students").insert(rows.map((row) => ({ name: row.name, grade: row.grade, class_name: row.className }))).select("id");
    if (studentError || !created) return jsonError(`학생 등록에 실패했습니다: ${studentError?.message ?? "등록 결과를 찾을 수 없습니다."}`, 500);
    const { error: assignmentError } = await db.from("assignments").insert(created.map((student, index) => ({ student_id: student.id, bus_id: busByNumber.get(rows[index].busNumber), stop_name: rows[index].stopName || null, start_date: startDate, end_date: endDate })));
    if (assignmentError) {
      await db.from("students").delete().in("id", created.map((student) => student.id));
      return jsonError(`학생 차량 배정에 실패했습니다: ${assignmentError.message}`, 500);
    }
    return Response.json({ ok: true, count: rows.length });
  } catch (error) {
    console.error("Student import failed", error);
    const detail = error instanceof Error ? error.message : "알 수 없는 서버 오류";
    return jsonError(`학생 일괄 등록 중 서버 오류가 발생했습니다: ${detail}`, 500);
  }
}
