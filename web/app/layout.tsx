import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import { LEGAL_PAGES } from "@/lib/company";
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
        <footer className="footer">
          <nav className="footer-links" aria-label="Legal">
            {LEGAL_PAGES.map((p) => <Link key={p.slug} href={`/legal/${p.slug}`}>{p.title}</Link>)}
          </nav>
          <p className="footer-line">18+ · Play responsibly · Demo version: all payments and games are simulated</p>
        </footer>
      </body>
    </html>
  );
}
