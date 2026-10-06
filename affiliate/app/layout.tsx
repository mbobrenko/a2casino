import type { Metadata, Viewport } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieNotice from "@/components/CookieNotice";
import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: reseñas de casinos online para Latinoamérica`, template: `%s | ${SITE.shortName}` },
  description: SITE.description,
  applicationName: SITE.name,
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1419" },
  ],
};

const orgLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: `${SITE.url}/`,
  inLanguage: "es",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <a href="#contenido" className="skip">Saltar al contenido</a>
        <Header />
        <main id="contenido">{children}</main>
        <Footer />
        <CookieNotice />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(orgLd) }} />
      </body>
    </html>
  );
}
