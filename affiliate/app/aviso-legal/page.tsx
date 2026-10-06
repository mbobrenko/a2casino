import Link from "next/link";
import { pageMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMeta({
  title: "Aviso legal y divulgación de afiliados",
  description: "Información legal: divulgación de enlaces de afiliado, edad mínima, naturaleza del sitio y responsabilidad sobre la legalidad del juego en tu país.",
  path: "/aviso-legal/",
});

export default function LegalPage() {
  return (
    <div className="container page narrow">
      <header className="page-head">
        <h1>Aviso legal</h1>
      </header>
      <section className="prose">
        <h2>Divulgación de afiliados</h2>
        <p>
          {SITE.name} participa en programas de afiliación de operadores de juego online. Muchos de los enlaces de este sitio (los botones «Visitar» y «Obtener bono», que pasan por direcciones del tipo <code>/ir/…</code>) son enlaces de afiliado: si te registras o depositas a través de ellos, <strong>podemos recibir una comisión</strong> del operador, por ejemplo un porcentaje de los ingresos que genera tu cuenta.
        </p>
        <p>
          Esa comisión <strong>no tiene ningún coste para ti</strong> y <strong>no influye en nuestras puntuaciones ni en el orden de los rankings</strong>, que se calculan con los criterios publicados en <Link href="/sobre-nosotros/">cómo evaluamos</Link>. Un casino no puede pagar para obtener una mejor nota.
        </p>

        <h2>No somos un casino</h2>
        <p>
          Este sitio es exclusivamente informativo. No organizamos juegos de azar, no aceptamos apuestas ni depósitos y no gestionamos cuentas de jugadores. Cualquier relación contractual se establece directamente entre tú y el operador que elijas, bajo sus propios términos y condiciones.
        </p>

        <h2>Solo para mayores de 18 años</h2>
        <p>
          El contenido de este sitio está dirigido a personas mayores de 18 años o de la edad mínima legal para jugar en su país, si es mayor. Si eres menor de edad, abandona este sitio.
        </p>

        <h2>Legalidad en tu país</h2>
        <p>
          La regulación del juego online es distinta en cada país y cambia con frecuencia. Es tu responsabilidad <strong>verificar que el juego online es legal en tu país</strong> y que el operador está autorizado a ofrecer sus servicios donde resides antes de registrarte. Nada de lo publicado aquí constituye asesoramiento legal, fiscal ni financiero.
        </p>

        <h2>Exactitud de la información</h2>
        <p>
          Revisamos los datos de cada casino e indicamos en cada reseña la fecha de la última verificación. Aun así, los operadores pueden cambiar sus bonos, términos y métodos de pago sin aviso. Confirma siempre las condiciones en el sitio oficial del operador antes de depositar. Si detectas un error, escríbenos a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
        </p>

        <h2>Juego responsable</h2>
        <p>
          Los juegos de azar implican riesgo de pérdida económica y pueden generar adicción. Juega solo con dinero que puedas permitirte perder. Encontrarás herramientas y recursos de ayuda en nuestra página de <Link href="/juego-responsable/">juego responsable</Link>.
        </p>

        <h2>Propiedad intelectual</h2>
        <p>
          Los textos de este sitio son originales. Las marcas y logotipos de los operadores pertenecen a sus respectivos titulares y se muestran solo con fines informativos.
        </p>
      </section>
    </div>
  );
}
