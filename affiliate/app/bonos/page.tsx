import Link from "next/link";
import BonusList from "./BonusList";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Bonos de casino: comparativa con requisitos de apuesta",
  description:
    "Compara bonos de bienvenida, giros gratis y bonos sin depósito de casinos online para Latinoamérica, con su requisito de apuesta y condiciones clave.",
  path: "/bonos/",
});

export default function BonosPage() {
  return (
    <div className="container page">
      <header className="page-head">
        <h1>Comparativa de bonos de casino</h1>
        <p className="lead">
          El porcentaje del bono importa menos que sus condiciones. Para cada oferta mostramos el requisito de apuesta y las condiciones clave. Antes de aceptar un bono, lee <Link href="/guias/requisitos-de-apuesta-wagering/">cómo funcionan los requisitos de apuesta</Link>.
        </p>
      </header>
      <BonusList />
      <p className="small muted disclaimer">
        Las condiciones de los bonos cambian con frecuencia: confírmalas siempre en el sitio del casino antes de depositar. Solo mayores de 18 años. Contiene <Link href="/aviso-legal/">enlaces de afiliado</Link>.
      </p>
    </div>
  );
}
