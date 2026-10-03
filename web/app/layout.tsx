import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2Casino",
  description: "A2Casino — слоты, настольные игры и кости",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="footer">18+ · Играйте ответственно · Тестовая версия, все платежи и игры имитированы</footer>
      </body>
    </html>
  );
}
