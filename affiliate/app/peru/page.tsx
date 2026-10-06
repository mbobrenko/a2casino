import CountryPage, { countryMeta } from "@/components/CountryPage";

export const metadata = countryMeta("pe");

export default function Page() {
  return (
    <CountryPage
      code="pe"
      intro={[
        "Seleccionamos casinos online que aceptan jugadores desde Perú y los comparamos por licencia, condiciones de bono, métodos de pago y velocidad de retiro.",
        "Para cada casino indicamos si acepta soles o métodos de pago en efectivo y si permite depositar y retirar con criptomonedas.",
      ]}
    />
  );
}
