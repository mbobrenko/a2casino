import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2Casino",
  description: "A2Casino — slots, table games and dice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="footer">18+ · Play responsibly · Demo version: all payments and games are simulated</footer>
      </body>
    </html>
  );
}
