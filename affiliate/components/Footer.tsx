import Link from "next/link";
import { SITE } from "@/lib/site";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <p className="footer-brand">{SITE.name}</p>
            <p className="muted">Reseñas y guías independientes sobre casinos online para jugadores de Latinoamérica. No somos un casino y no aceptamos apuestas.</p>
          </div>
          <nav aria-label="Países">
            <p className="footer-h">Por país</p>
            <Link href="/mexico/">Casinos en México</Link>
            <Link href="/chile/">Casinos en Chile</Link>
            <Link href="/peru/">Casinos en Perú</Link>
            <Link href="/bonos/">Comparar bonos</Link>
          </nav>
          <nav aria-label="Guías">
            <p className="footer-h">Guías</p>
            <Link href="/guias/como-elegir-casino-online-seguro/">Casino seguro</Link>
            <Link href="/guias/requisitos-de-apuesta-wagering/">Requisitos de apuesta</Link>
            <Link href="/guias/depositar-y-retirar-con-criptomonedas/">Pagos con cripto</Link>
            <Link href="/guias/que-es-el-rtp-y-la-ventaja-de-la-casa/">RTP y ventaja de la casa</Link>
          </nav>
          <nav aria-label="Información legal">
            <p className="footer-h">Información</p>
            <Link href="/sobre-nosotros/">Sobre nosotros</Link>
            <Link href="/juego-responsable/">Juego responsable</Link>
            <Link href="/aviso-legal/">Aviso legal</Link>
            <Link href="/privacidad/">Privacidad y cookies</Link>
          </nav>
        </div>
        <div className="footer-bottom">
          <p>
            <span className="age-badge" aria-label="Solo mayores de 18 años">18+</span>
            Juega con responsabilidad. El juego puede crear adicción. <Link href="/juego-responsable/">Juego responsable</Link>
          </p>
          <p className="muted small">
            Divulgación: este sitio contiene enlaces de afiliado. Podemos recibir una comisión si te registras a través de ellos, sin coste para ti; eso no influye en nuestras puntuaciones. <Link href="/aviso-legal/">Más información</Link>. Verifica la legalidad del juego online en tu país.
          </p>
          <p className="muted small">© {new Date().getFullYear()} {SITE.name}</p>
        </div>
      </div>
    </footer>
  );
}
