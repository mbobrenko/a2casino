import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container page narrow center">
      <h1>Página no encontrada</h1>
      <p className="lead">La página que buscas no existe o se ha movido.</p>
      <p><Link href="/" className="btn btn-primary">Volver al inicio</Link></p>
    </div>
  );
}
