import Link from "next/link";

export default function TrustBlock() {
  return (
    <section className="section trust" aria-labelledby="trust-h">
      <h2 id="trust-h">Por qué puedes confiar en nuestras reseñas</h2>
      <div className="cards cards-3">
        <div className="card">
          <span className="trust-icon" aria-hidden="true">🔍</span>
          <h3>Cómo evaluamos</h3>
          <p>Puntuamos cada casino con seis criterios ponderados: seguridad y licencia, pagos, bonos, juegos, soporte y usabilidad. Comprobamos la licencia en el registro del regulador y leemos los términos completos.</p>
          <Link href="/sobre-nosotros/">Ver la metodología</Link>
        </div>
        <div className="card">
          <span className="trust-icon age" aria-hidden="true">18+</span>
          <h3>Solo para adultos</h3>
          <p>Este sitio está dirigido a mayores de 18 años. Comprueba la edad mínima y la normativa sobre juego online de tu país antes de registrarte en cualquier casino.</p>
          <Link href="/aviso-legal/">Aviso legal</Link>
        </div>
        <div className="card">
          <span className="trust-icon" aria-hidden="true">🤝</span>
          <h3>Juego responsable</h3>
          <p>Jugar tiene un coste y la casa siempre tiene ventaja. Fija límites, no persigas pérdidas y pide ayuda si el juego deja de ser entretenimiento.</p>
          <Link href="/juego-responsable/">Herramientas y ayuda</Link>
        </div>
      </div>
    </section>
  );
}
