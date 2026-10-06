import Link from "next/link";
import { NAV, SITE } from "@/lib/site";

// The mobile menu is a <details> element, so it works without JavaScript.
export default function Header() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name}, inicio`}>
          <span className="brand-mark" aria-hidden="true">★</span>
          <span className="brand-text">Casinos<span>Confiables</span></span>
        </Link>
        <nav className="nav-desktop" aria-label="Principal">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <details className="nav-mobile">
          <summary aria-label="Abrir menú"><span className="burger" aria-hidden="true" /> Menú</summary>
          <nav aria-label="Principal (móvil)">
            {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
            <Link href="/mexico/">México</Link>
            <Link href="/chile/">Chile</Link>
            <Link href="/peru/">Perú</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
