import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "통학버스 안전일지",
  description: "학교 통학버스 운행일지와 월간 안전 점검을 한곳에서 관리합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
