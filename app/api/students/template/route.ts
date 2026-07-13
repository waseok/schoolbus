import ExcelJS from "exceljs";
import { jsonError } from "../../../../db/runtime";
import { requireUser } from "../../../auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser(request, ["admin"]);
  if (!user) return jsonError("관리자 권한이 필요합니다.", 403);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("학생등록");
  sheet.columns = [
    { header: "이름", key: "name", width: 14 },
    { header: "학년", key: "grade", width: 10 },
    { header: "반", key: "className", width: 12 },
    { header: "차량번호", key: "busNumber", width: 12 },
    { header: "승차장소", key: "stopName", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174F3F" } };
  sheet.addRow({ name: "홍길동", grade: 1, className: "1반", busNumber: 1, stopName: "예: 와석아파트" });
  sheet.addRow({ name: "김하늘", grade: 3, className: "2반", busNumber: 2, stopName: "예: 중앙공원" });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": "attachment; filename*=UTF-8''%ED%86%B5%ED%95%99%EB%B2%84%EC%8A%A4_%ED%95%99%EC%83%9D%EB%93%B1%EB%A1%9D_%EC%96%91%EC%8B%9D.xlsx",
  } });
}
