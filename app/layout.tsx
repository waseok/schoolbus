import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "와석초등 통학버스 관리 플랫폼",
  description: "와석초등학교 등교 통학버스 운행과 안전 점검을 관리합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
