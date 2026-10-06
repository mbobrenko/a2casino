import { pageMeta } from "@/lib/seo";
import { SITE } from "@/lib/site";

export const metadata = pageMeta({
  title: "Política de privacidad y cookies",
  description: "Qué datos tratamos, qué almacenamiento usamos en tu navegador y qué ocurre cuando visitas un casino a través de nuestros enlaces.",
  path: "/privacidad/",
});

export default function PrivacyPage() {
  return (
    <div className="container page narrow">
      <header className="page-head">
        <h1>Privacidad y cookies</h1>
      </header>
      <section className="prose">
        <h2>Resumen</h2>
        <ul>
          <li>No pedimos registro y no recogemos tu nombre, correo ni datos de pago.</li>
          <li>No usamos cookies publicitarias ni de seguimiento propias.</li>
          <li>Cuando haces clic en un enlace a un casino, ese casino puede usar sus propias cookies.</li>
        </ul>

        <h2>Datos que tratamos</h2>
        <p>
          Como cualquier sitio web, el servidor que aloja este sitio puede registrar datos técnicos de cada visita (dirección IP, tipo de navegador, página solicitada y fecha) para su funcionamiento y seguridad. No usamos esos datos para identificarte.
        </p>
        <p>
          Cuando haces clic en un enlace a un casino, podemos registrar de forma agregada que se produjo el clic (qué casino, desde qué sección del sitio y cuándo) para saber qué contenido es útil. Ese registro no incluye datos que te identifiquen directamente.
        </p>

        <h2>Cookies y almacenamiento local</h2>
        <p>
          Este sitio no instala cookies propias. Solo guarda en el almacenamiento local de tu navegador (localStorage) que cerraste el aviso de cookies, para no volver a mostrarlo. Puedes borrarlo desde la configuración de tu navegador.
        </p>
        <h3>Cookies de terceros</h3>
        <p>
          Al visitar un casino a través de nuestros enlaces de afiliado, el casino o su plataforma de afiliación puede instalar cookies en tu navegador para atribuir tu registro a nuestro sitio. Esas cookies se rigen por la política de privacidad del casino correspondiente, que te recomendamos leer.
        </p>

        <h2>Tus derechos</h2>
        <p>
          Puedes solicitar información sobre los datos que tratamos o pedir su eliminación escribiendo a <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. Según tu país de residencia, puedes tener derechos adicionales reconocidos por la legislación de protección de datos local.
        </p>

        <h2>Cambios</h2>
        <p>Podemos actualizar esta política. La versión vigente es siempre la publicada en esta página.</p>
      </section>
    </div>
  );
}
