import Link from "next/link";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Juego responsable: límites, autoexclusión y ayuda",
  description: "Consejos para jugar con control, herramientas de los casinos (límites, pausas, autoexclusión) y organizaciones que ofrecen ayuda gratuita.",
  path: "/juego-responsable/",
});

export default function ResponsiblePage() {
  return (
    <div className="container page narrow">
      <header className="page-head">
        <span className="age-badge big" aria-label="Solo mayores de 18 años">18+</span>
        <h1>Juego responsable</h1>
        <p className="lead">
          El juego debe ser entretenimiento, nunca una forma de ganar dinero ni de resolver problemas. La casa siempre tiene ventaja a largo plazo.
        </p>
      </header>
      <section className="prose">
        <h2>Antes de jugar</h2>
        <ul>
          <li>Decide cuánto puedes gastar y considéralo gastado desde el principio.</li>
          <li>Fija un tiempo máximo de juego y respétalo.</li>
          <li>No persigas pérdidas, no pidas prestado y no juegues con dinero destinado a gastos esenciales.</li>
          <li>No juegues bajo los efectos del alcohol ni cuando estés triste, estresado o enojado.</li>
        </ul>

        <h2>Herramientas en tu cuenta de casino</h2>
        <ul>
          <li><strong>Límites de depósito</strong> diarios, semanales o mensuales.</li>
          <li><strong>Límites de pérdida, de apuesta y de tiempo</strong> de sesión.</li>
          <li><strong>Recordatorios de realidad</strong> que te muestran el tiempo jugado y el resultado.</li>
          <li><strong>Pausa temporal</strong> de un día a varias semanas.</li>
          <li><strong>Autoexclusión</strong> durante meses, años o de forma indefinida. Si te autoexcluyes, hazlo en todos los casinos donde tengas cuenta.</li>
        </ul>
        <p>
          Además puedes instalar bloqueadores de sitios de apuestas como BetBlocker (gratuito) o Gamban, y preguntar a tu banco si permite bloquear pagos a comercios de juego.
        </p>

        <h2>¿Tienes un problema con el juego?</h2>
        <p>Algunas señales: juegas más de lo que querías, intentas recuperar lo perdido, ocultas cuánto juegas, pides dinero para jugar o te sientes mal cuando intentas parar.</p>

        <h2>Dónde pedir ayuda</h2>
        <ul>
          <li><strong>Jugadores Anónimos</strong>: grupos de apoyo mutuo con reuniones en español en muchos países. Busca reuniones en <a href="https://www.gamblersanonymous.org/" target="_blank" rel="noopener noreferrer">gamblersanonymous.org</a> o busca «Jugadores Anónimos» y el nombre de tu ciudad.</li>
          <li><strong>Gambling Therapy</strong>: apoyo gratuito en línea, también en español: <a href="https://www.gamblingtherapy.org/" target="_blank" rel="noopener noreferrer">gamblingtherapy.org</a>.</li>
          <li><strong>GamCare</strong>: información y recursos sobre el juego problemático: <a href="https://www.gamcare.org.uk/" target="_blank" rel="noopener noreferrer">gamcare.org.uk</a>.</li>
          <li><strong>Servicios de salud mental</strong> de tu país, que pueden orientarte hacia un tratamiento especializado.</li>
        </ul>
        <aside className="callout">
          Si estás en crisis o piensas en hacerte daño, llama ahora al número de emergencias de tu país o acude al servicio de urgencias más cercano.
        </aside>
        <p>
          Lee la guía completa: <Link href="/guias/juego-responsable-limites-y-ayuda/">Juego responsable: límites, autoexclusión y dónde pedir ayuda</Link>.
        </p>
      </section>
    </div>
  );
}
