import CountryPage, { countryMeta } from "@/components/CountryPage";

export const metadata = countryMeta("cl");

export default function Page() {
  return (
    <CountryPage
      code="cl"
      intro={[
        "Seleccionamos casinos online que aceptan jugadores desde Chile y los comparamos por licencia, condiciones de bono, métodos de pago y velocidad de retiro.",
        "Para cada casino indicamos si acepta pagos en pesos chilenos o métodos locales, y si permite depositar y retirar con criptomonedas.",
      ]}
    />
  );
}
