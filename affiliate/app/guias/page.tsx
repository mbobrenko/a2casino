import GuideCards from "@/components/GuideCards";
import { latestGuides } from "@/data/guides";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Guías sobre casinos online",
  description: "Guías prácticas en español: cómo elegir un casino seguro, requisitos de apuesta, pagos con criptomonedas, RTP y juego responsable.",
  path: "/guias/",
});

export default function GuidesIndex() {
  return (
    <div className="container page">
      <header className="page-head">
        <h1>Guías</h1>
        <p className="lead">Lo que conviene saber antes de jugar: explicado con claridad, con ejemplos y sin promesas.</p>
      </header>
      <GuideCards list={latestGuides()} />
    </div>
  );
}
