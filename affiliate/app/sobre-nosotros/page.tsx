import Link from "next/link";
import { CRITERIA } from "@/data/casinos";
import { pageMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMeta({
  title: "Sobre nosotros y cómo evaluamos los casinos",
  description: "Quiénes somos, cómo puntuamos los casinos online (criterios y ponderaciones) y cómo nos financiamos.",
  path: "/sobre-nosotros/",
});

const DETAILS: Record<string, string> = {
  seguridad: "Licencia vigente y verificable en el registro del regulador, empresa operadora identificada, cifrado, proceso de verificación (KYC) razonable y herramientas de juego responsable.",
  pagos: "Métodos de depósito y retiro disponibles en la región (incluidas criptomonedas), importes mínimos, límites, comisiones y tiempos de retiro reales.",
  bonos: "Valor real del bono una vez aplicados el requisito de apuesta, la contribución de los juegos, la apuesta máxima, el plazo y el límite de ganancia. Un bono grande con condiciones duras puntúa bajo.",
  juegos: "Variedad y calidad del catálogo, proveedores reconocidos, casino en vivo, información de RTP disponible y modo demo.",
  soporte: "Canales disponibles, horario, atención en español y calidad de las respuestas a preguntas de prueba.",
  usabilidad: "Facilidad de registro, funcionamiento en móvil, claridad de la información y de los términos.",
};

export default function AboutPage() {
  return (
    <div className="container page narrow">
      <header className="page-head">
        <h1>Sobre nosotros</h1>
        <p className="lead">
          {SITE.name} es un sitio independiente de reseñas y guías sobre casinos online para jugadores de Latinoamérica. Nuestro objetivo es que elijas con información verificable, no con publicidad.
        </p>
      </header>

      <section className="section prose">
        <h2>Cómo evaluamos un casino</h2>
        <p>
          Cada casino recibe una nota de 0 a 10 en seis criterios. La puntuación global es la media ponderada de esas notas. Usamos las mismas ponderaciones para todos los casinos y las publicamos aquí:
        </p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th scope="col">Criterio</th><th scope="col">Peso</th><th scope="col">Qué revisamos</th></tr></thead>
            <tbody>
              {CRITERIA.map((c) => (
                <tr key={c.key}>
                  <td><strong>{c.label}</strong></td>
                  <td>{Math.round(c.weight * 100)}%</td>
                  <td>{DETAILS[c.key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Nuestro proceso</h2>
        <ol>
          <li>Comprobamos la licencia en el registro público del regulador y que la empresa del sello coincida con la de los términos y condiciones.</li>
          <li>Leemos los términos generales, los términos del bono y la política de retiros completos.</li>
          <li>Contactamos con el soporte con preguntas concretas para valorar la rapidez y la calidad de la respuesta.</li>
          <li>Registramos la fecha de la última verificación en cada reseña y revisamos los datos periódicamente.</li>
          <li>Si un casino empeora sus condiciones o acumula reclamaciones sin resolver, bajamos su puntuación o lo retiramos del sitio.</li>
        </ol>

        <h2>Cómo nos financiamos</h2>
        <p>
          Participamos en programas de afiliación de casinos: si te registras a través de nuestros enlaces, el casino puede pagarnos una comisión. Esto no tiene coste para ti y <strong>no influye en las puntuaciones</strong>, que se calculan con los criterios de esta página. Más detalles en el <Link href="/aviso-legal/">aviso legal</Link>.
        </p>

        <h2>Lo que no hacemos</h2>
        <ul>
          <li>No somos un casino ni aceptamos apuestas.</li>
          <li>No publicamos casinos sin licencia verificable.</li>
          <li>No prometemos ganancias ni sistemas para vencer a la casa: no existen.</li>
        </ul>

        <h2>Contacto</h2>
        <p>¿Has encontrado un dato incorrecto o has tenido un problema con un casino que reseñamos? Escríbenos a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.</p>
      </section>
    </div>
  );
}
