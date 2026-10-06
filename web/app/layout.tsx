import type { Metadata } from "next";
import Link from "next/link";
import { Lilita_One } from "next/font/google";
import Header from "@/components/Header";
import RealityCheck from "@/components/RealityCheck";
import { LEGAL_PAGES } from "@/lib/company";
import "./globals.css";

// Display face for game titles and headings (self-hosted by next/font at build time).
const display = Lilita_One({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-display" });

export const metadata: Metadata = {
  title: "A2Casino",
  description: "A2Casino — slots, table games and dice",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>
        <Header />
        <main className="container">{children}</main>
        <RealityCheck />
        <footer className="footer">
          <nav className="footer-links" aria-label="Legal">
            {LEGAL_PAGES.map((p) => <Link key={p.slug} href={`/legal/${p.slug}`}>{p.title}</Link>)}
          </nav>
          <p className="footer-line">18+ · <Link href="/responsible-gaming">Play responsibly: set limits or take a break</Link> · Demo version: all payments and games are simulated</p>
        </footer>
      </body>
    </html>
  );
}
