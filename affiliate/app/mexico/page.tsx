import CountryPage, { countryMeta } from "@/components/CountryPage";

export const metadata = countryMeta("mx");

export default function Page() {
  return (
    <CountryPage
      code="mx"
      intro={[
        "Seleccionamos casinos online que aceptan jugadores desde México y los comparamos por licencia, condiciones de bono, métodos de pago y velocidad de retiro.",
        "Indicamos qué casinos ofrecen métodos de pago habituales en el país, como transferencias SPEI o pagos en efectivo, y cuáles aceptan criptomonedas como USDT.",
      ]}
    />
  );
}
