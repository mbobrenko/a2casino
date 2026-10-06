// Guides (/guias/<slug>/). The body uses a small Markdown subset rendered by components/Prose.tsx:
//   ## heading, ### subheading, blank-line separated paragraphs, "- " bullet lists, "1. " numbered lists,
//   "> " callout, "| a | b |" tables (first row = header), **bold**, [text](url).

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Emoji used as the card illustration. */
  icon: string;
  published: string;
  updated: string;
  readingMinutes: number;
  body: string;
}

export const guides: Guide[] = [
  {
    slug: "como-elegir-casino-online-seguro",
    title: "Cómo elegir un casino online seguro: licencias y señales de alerta",
    description:
      "Qué significa una licencia de Curaçao, Anjouan o la MGA, cómo comprobarla en dos minutos y qué señales indican que debes buscar otro casino.",
    icon: "🛡️",
    published: "2026-09-20",
    updated: "2026-10-01",
    readingMinutes: 7,
    body: `Antes de mirar el bono o el catálogo de juegos, la pregunta más importante es otra: **¿me van a pagar cuando gane?** Un casino seguro es aquel que opera con una licencia verificable, publica condiciones claras y procesa los retiros en los plazos que promete. En esta guía te explicamos cómo comprobarlo tú mismo, sin depender de lo que diga el propio casino ni de lo que digamos nosotros.

## Por qué la licencia es lo primero

Una licencia de juego significa que una autoridad pública ha autorizado a una empresa concreta a ofrecer juegos de azar y que esa empresa debe cumplir ciertas reglas: separar fondos, verificar la identidad de los jugadores, prevenir el lavado de dinero, usar generadores de números aleatorios auditados y atender reclamaciones. El nivel de exigencia y de supervisión cambia mucho de un regulador a otro, pero un casino **sin ninguna licencia** no tiene a nadie por encima a quien rendir cuentas. Si no encuentras información de licencia, no sigas.

## Los reguladores más habituales en casinos para Latinoamérica

### Curaçao

Es la jurisdicción más común entre los casinos internacionales que aceptan jugadores latinoamericanos. Durante años funcionó con un sistema de "licencias maestras" que permitían a varios operadores trabajar bajo una misma licencia, con una supervisión considerada laxa. Curaçao ha reformado ese modelo en los últimos años: las licencias pasan a otorgarse directamente por la autoridad de juego del país (Curaçao Gaming Authority), con más requisitos para los operadores. En la práctica, una licencia de Curaçao es un mínimo razonable, pero no una garantía de buen servicio: conviene complementar la comprobación con las demás señales de esta guía.

### Anjouan

Anjouan es una de las islas de la Unión de las Comoras y emite licencias de juego online a través de su autoridad financiera offshore. Es una opción popular entre casinos nuevos y casinos centrados en criptomonedas porque el proceso es rápido y económico. Eso también significa que la supervisión es más ligera y que las vías de reclamación para el jugador son limitadas. No es motivo para descartar un casino, pero sí para ser más exigente con el resto de criterios.

### Malta Gaming Authority (MGA)

La MGA es uno de los reguladores más estrictos del sector. Exige capital mínimo, auditorías, políticas de juego responsable y un proceso formal de reclamaciones, y publica un registro de licencias en su web oficial (mga.org.mt). Menos casinos con licencia MGA aceptan jugadores de Latinoamérica, pero cuando lo hacen suele ser una buena señal.

### Reguladores locales

Algunos países de la región tienen sus propios sistemas de autorización para el juego online, y en otros la regulación está en discusión o cambia con frecuencia. Si tu país mantiene un registro oficial de operadores autorizados, consúltalo, y **verifica siempre la normativa local** antes de registrarte en cualquier sitio.

## Cómo comprobar una licencia en dos minutos

1. Baja hasta el pie de página del casino. Debe aparecer el nombre de la empresa operadora, su domicilio, el regulador y normalmente un número de licencia.
2. Haz clic en el sello de la licencia. Un sello legítimo suele abrir una página de validación **en el dominio del regulador** o de su proveedor oficial de validación. Si es solo una imagen sin enlace, desconfía.
3. Compara el nombre de la empresa del sello con el que figura en los términos y condiciones. Deben coincidir.
4. Si el regulador tiene un registro público (como el de la MGA), busca allí el nombre de la empresa o el número de licencia y comprueba que la licencia esté vigente y que el dominio del casino figure asociado.

## Señales de alerta

Ninguna de estas señales por sí sola demuestra que un casino sea fraudulento, pero cuantas más acumule, más motivos tienes para buscar otra opción:

- **No hay información de licencia** o el sello no lleva a ninguna parte.
- **Términos y condiciones confusos, contradictorios o solo en otro idioma**, sobre todo en lo relativo a retiros y bonos.
- **Cláusulas que permiten anular ganancias por motivos vagos**, como "juego irregular" sin definir qué significa.
- **Límites de retiro muy bajos** (por ejemplo, una cantidad pequeña por semana) que obligarían a esperar meses para cobrar un premio importante.
- **Te piden depositar más para poder retirar**, o pagar una "comisión de liberación" por adelantado. Un casino serio descuenta sus comisiones del retiro; no te pide dinero nuevo.
- **Bonos desproporcionados** (porcentajes enormes sin condiciones claras). Cuanto más generoso parece un bono, más importante es leer el requisito de apuesta y el límite de ganancia.
- **Presión para depositar**: mensajes insistentes, cuentas atrás falsas o "gestores VIP" que te escriben por mensajería personal.
- **Ausencia de herramientas de juego responsable**: si no puedes fijar límites de depósito ni autoexcluirte, el operador no está cumpliendo lo mínimo.
- **Dominios parecidos al de una marca conocida** con pequeñas diferencias de letras. Entra siempre desde un enlace de confianza.

## Otros criterios que también importan

### Verificación de identidad (KYC)

Es normal que un casino con licencia te pida un documento de identidad y un comprobante de domicilio antes del primer retiro. No es una mala señal, al contrario. Lo que sí debe preocuparte es que solo te lo pidan cuando ganas una cantidad grande y que, tras enviarlo, el proceso se alargue sin explicaciones. Un buen consejo es **verificar la cuenta justo después de registrarte**, antes de que haya dinero en juego.

### Métodos de pago

Fíjate en que el casino ofrezca métodos que puedas usar tanto para depositar como para retirar, con importes mínimos y plazos publicados. Si solo hay métodos de depósito y el apartado de retiros es vago, es una mala señal.

### Atención al cliente

Antes de depositar, escribe al chat con una pregunta concreta (por ejemplo, cuánto tarda un retiro con tu método de pago). La rapidez y la claridad de la respuesta dicen mucho del servicio que recibirás cuando tengas un problema real.

### Reputación

Busca opiniones de otros jugadores en foros y sitios de reclamaciones, pero léelas con criterio: casi todos los casinos tienen quejas, y lo relevante es si las resuelven y si los problemas se repiten (por ejemplo, retiros bloqueados de forma sistemática).

## Lista de comprobación rápida

- Licencia visible y verificable en la web del regulador.
- Empresa operadora identificada y coincidente en sello y términos.
- Condiciones de bono y de retiro claras y en español.
- Métodos de retiro disponibles para tu país, con plazos publicados.
- Herramientas de límites y autoexclusión.
- Soporte que responde de forma concreta.

> Recuerda que ninguna licencia elimina el riesgo de perder dinero jugando. Juega solo con lo que puedas permitirte perder y consulta nuestra guía de [juego responsable](/guias/juego-responsable-limites-y-ayuda/).`,
  },
  {
    slug: "requisitos-de-apuesta-wagering",
    title: "Cómo funcionan los requisitos de apuesta (wagering), con ejemplos",
    description:
      "Qué significa un rollover de 35x, cómo calcular cuánto tienes que apostar, cómo afectan la contribución de los juegos, la apuesta máxima y el límite de ganancia.",
    icon: "🧮",
    published: "2026-09-22",
    updated: "2026-10-01",
    readingMinutes: 7,
    body: `Casi todos los bonos de casino tienen un **requisito de apuesta** (en inglés *wagering requirement*, también llamado *rollover*). Es la condición que convierte el dinero de bono en dinero que puedes retirar, y es lo que de verdad determina si un bono vale la pena. Un "200% de bono" con condiciones duras puede valer menos que un 50% con condiciones sencillas.

## La idea básica

El requisito de apuesta indica **cuántas veces tienes que apostar una cantidad antes de poder retirar** el bono y las ganancias obtenidas con él. Se expresa como un multiplicador: 30x, 35x, 40x, etc. Ojo: no significa que tengas que perder esa cantidad, sino que la suma de todas tus apuestas debe alcanzarla. Si apuestas 1 USD y ganas 2 USD, esa jugada cuenta como 1 USD apostado; si luego apuestas esos 2 USD, suman otros 2 USD.

## Sobre qué se calcula: bono o depósito + bono

Este detalle cambia mucho el resultado, así que búscalo siempre en las condiciones.

**Ejemplo 1: 35x sobre el bono.** Depositas 100 USD y recibes un bono del 100%, es decir, 100 USD de bono.

- Cantidad a apostar = 100 × 35 = **3.500 USD**.

**Ejemplo 2: 35x sobre depósito + bono.** Mismo depósito y mismo bono.

- Cantidad a apostar = (100 + 100) × 35 = **7.000 USD**.

El mismo "35x" exige el doble de juego en el segundo caso. Por eso, al comparar bonos, conviértelos siempre a la cantidad total que tendrías que apostar.

## La contribución de cada juego

No todos los juegos cuentan igual para cumplir el requisito. Lo habitual es que las tragamonedas contribuyan al 100% y que los juegos de mesa (ruleta, blackjack, baccarat) y el casino en vivo contribuyan mucho menos o nada. Los porcentajes exactos los fija cada casino en sus términos.

**Ejemplo 3.** Debes apostar 3.500 USD y quieres jugar al blackjack, que en ese casino contribuye al 10%.

- Cada 1 USD apostado en blackjack cuenta como 0,10 USD.
- Apuesta real necesaria = 3.500 ÷ 0,10 = **35.000 USD**.

| Juego (ejemplo) | Contribución | Apuesta real para cumplir 3.500 USD |
| Tragamonedas | 100% | 3.500 USD |
| Ruleta | 20% | 17.500 USD |
| Blackjack | 10% | 35.000 USD |
| Juegos excluidos | 0% | No cuenta |

Si juegas a un juego excluido mientras tienes un bono activo, en el mejor de los casos esas apuestas no cuentan; en el peor, el casino puede anular el bono y las ganancias. Revisa la lista de juegos excluidos antes de empezar.

## Por qué el requisito importa más que el porcentaje

Cada juego tiene una ventaja de la casa: la parte de cada apuesta que el casino espera quedarse a largo plazo (lo explicamos en nuestra guía sobre [RTP y ventaja de la casa](/guias/que-es-el-rtp-y-la-ventaja-de-la-casa/)). Cuanto más tengas que apostar, más pesa esa ventaja.

**Ejemplo 4.** Tienes que apostar 3.500 USD en tragamonedas con un RTP del 96% (ventaja de la casa del 4%).

- Pérdida esperada = 3.500 × 0,04 = **140 USD**.
- El bono era de 100 USD.

En promedio, cumplir el requisito te costaría más de lo que vale el bono. Con un requisito de 20x, en cambio, apostarías 2.000 USD y la pérdida esperada sería de 80 USD, menor que el bono. Es un cálculo teórico (la suerte a corto plazo puede ir en cualquier dirección), pero sirve para comparar ofertas con criterio.

## Otras condiciones que debes leer

### Apuesta máxima con bono activo

Casi todos los bonos limitan la apuesta por jugada mientras el bono está activo (por ejemplo, 5 USD por giro). Superarla, aunque sea una vez, suele ser motivo para anular las ganancias. Es la causa más común de reclamaciones.

### Plazo para cumplir el requisito

El bono caduca si no completas el requisito a tiempo: 7, 14 o 30 días son plazos frecuentes. Si el plazo es corto y el requisito alto, tendrías que jugar mucho en pocos días, lo que no es recomendable.

### Límite de ganancia o de retiro

Algunos bonos, sobre todo los **sin depósito** y los giros gratis, limitan lo máximo que puedes retirar. Si el límite es 100 USD y ganas 500 USD, solo podrás retirar 100 USD.

### Giros gratis

Las ganancias de los giros gratis suelen convertirse en saldo de bono con su propio requisito.

**Ejemplo 5.** Recibes 50 giros gratis y ganas 20 USD. Las ganancias tienen un requisito de 40x.

- Cantidad a apostar = 20 × 40 = **800 USD**.

### Orden de uso del saldo

En muchos casinos se juega primero con el dinero real y después con el bono; en otros, ambos saldos se mezclan. Esto afecta a si puedes retirar tu depósito antes de cumplir el requisito. Si no está claro en los términos, pregúntalo al soporte y guarda la respuesta.

### Bonos opcionales

Un buen casino te deja **rechazar el bono**. Si prefieres poder retirar en cualquier momento sin condiciones, jugar sin bono es perfectamente válido.

## Cómo comparar dos bonos en tres pasos

1. Calcula la cantidad total a apostar (multiplicador × base correcta).
2. Divide por la contribución del juego que piensas usar.
3. Revisa apuesta máxima, plazo y límite de ganancia. Si alguna condición te resulta imposible de cumplir con tu forma de jugar, ese bono no es para ti.

> Un bono es una herramienta de marketing del casino, no dinero gratis. No deposites más de lo que tenías previsto solo para conseguir un bono mayor.`,
  },
  {
    slug: "depositar-y-retirar-con-criptomonedas",
    title: "Depositar y retirar con criptomonedas: USDT TRC-20, comisiones y seguridad",
    description:
      "Guía práctica para usar USDT, Bitcoin y otras criptomonedas en un casino online: redes, comisiones, errores que hacen perder fondos y cómo proteger tu wallet.",
    icon: "🪙",
    published: "2026-09-25",
    updated: "2026-10-01",
    readingMinutes: 8,
    body: `Muchos casinos internacionales que aceptan jugadores de Latinoamérica permiten depositar y retirar con criptomonedas. Las ventajas son claras (retiros que pueden llegar en minutos, sin depender de bancos ni de tarjetas internacionales), pero también hay riesgos propios: una transacción enviada a la red equivocada o a una dirección incorrecta normalmente **no se puede revertir**. Esta guía te explica cómo hacerlo bien.

## Stablecoins frente a criptomonedas volátiles

Una **stablecoin** como USDT (Tether) o USDC está diseñada para mantener un valor cercano a 1 dólar estadounidense. Para jugar suele ser la opción más práctica: lo que depositas y lo que retiras mantiene un valor estable en dólares.

Bitcoin, Ether y otras criptomonedas **cambian de precio constantemente**. Si depositas en BTC y el casino convierte tu saldo a dólares, o si retiras en BTC y tardas días en venderlo, el tipo de cambio puede jugar a tu favor o en tu contra, al margen de lo que hayas ganado o perdido en el casino.

## Una misma moneda, varias redes

Este es el punto que más errores provoca. USDT existe en varias cadenas de bloques (redes) distintas. Las más comunes en casinos son:

| Red | Nombre habitual | Formato de la dirección | Comisión de red |
| Tron | USDT TRC-20 | Empieza por "T" | Se paga en TRX; suele ser baja |
| Ethereum | USDT ERC-20 | Empieza por "0x" | Se paga en ETH; puede ser alta cuando la red está congestionada |
| BNB Smart Chain | USDT BEP-20 | Empieza por "0x" | Se paga en BNB; suele ser baja |

**La red del envío debe coincidir con la red de la dirección de destino.** Si el casino te da una dirección para USDT TRC-20, debes retirar desde tu exchange o wallet eligiendo explícitamente la red Tron (TRC-20). Enviar por otra red puede hacer que los fondos se pierdan o que su recuperación dependa de la buena voluntad del casino. Fíjate que las direcciones de Ethereum y BNB Smart Chain tienen el mismo formato ("0x..."), así que el formato no basta para distinguirlas: lee siempre el nombre de la red.

Por su comisión baja y su rapidez, **USDT en TRC-20** es una de las opciones más usadas para jugar.

## Cómo depositar paso a paso

1. En el casino, ve a la sección de depósito y elige la moneda **y la red** (por ejemplo, "USDT – TRC-20").
2. Copia la dirección que te muestra el casino usando el botón de copiar. No la escribas a mano.
3. Comprueba el **depósito mínimo**: si envías menos, el casino puede no acreditarlo.
4. En tu exchange o wallet, elige la misma moneda y la misma red, pega la dirección y **compara el principio y el final** de la dirección pegada con la del casino. Existe malware que cambia las direcciones copiadas en el portapapeles.
5. Si es tu primera vez con ese casino, haz primero un **envío pequeño de prueba**.
6. Espera las confirmaciones de la red. El casino suele indicar cuántas necesita; normalmente son unos minutos.

Algunos casinos generan una dirección distinta para cada depósito o la cambian con el tiempo. Copia siempre la dirección actual desde tu cuenta, no una que hayas guardado de una vez anterior.

### Memo, tag o etiqueta de destino

Algunas criptomonedas (como XRP, XLM o EOS) usan, además de la dirección, un **memo o tag** que identifica tu cuenta dentro de la dirección compartida del casino. Si el casino te muestra un memo y no lo incluyes, el depósito no se acreditará automáticamente.

## Comisiones: quién cobra qué

- **Comisión de red**: la cobra la cadena de bloques, no el casino. Varía según la red y su congestión.
- **Comisión de retiro del exchange**: cuando envías cripto desde un exchange, este suele cobrar una comisión fija por retiro, distinta para cada moneda y red. Consúltala antes de enviar.
- **Comisión del casino**: muchos casinos no cobran por depositar o retirar en cripto, pero algunos sí, o fijan un retiro mínimo. Búscalo en la página de pagos.
- **Diferencial de cambio**: si conviertes moneda local a cripto (o al revés) en un exchange o en un mercado P2P, el precio de compra y venta no es el mismo. Esa diferencia es un coste más.

## Retirar del casino

1. **Verifica tu cuenta (KYC) antes**, aunque el casino acepte depósitos sin verificación. Muchos la exigen para retirar, y hacerlo al principio evita retrasos cuando ganes.
2. Si usaste un bono, comprueba que el requisito de apuesta esté completo; si no, el retiro puede anular el bono.
3. Copia la dirección de recepción **de tu propia wallet o exchange**, en la red correcta, y pégala en el casino.
4. Revisa el importe mínimo de retiro y la comisión, si existe.
5. Conserva el identificador de la transacción (TXID o hash). Con él puedes seguir el envío en un explorador de bloques y demostrarlo si hay un problema.

Ten en cuenta que algunos exchanges pueden revisar o restringir los fondos que reciben de sitios de juego. Lee las condiciones de tu exchange.

## Seguridad de tu wallet

### Wallet custodial o no custodial

En un **exchange** (wallet custodial), la empresa guarda las claves por ti: es cómodo, pero dependes de ella. En una **wallet no custodial** (aplicaciones como las wallets móviles de autocustodia o un dispositivo hardware), solo tú controlas los fondos mediante tu frase de recuperación.

### La frase de recuperación

- Son normalmente 12 o 24 palabras. Quien la tenga controla tus fondos.
- **Nadie legítimo te la pedirá nunca**: ni el casino, ni el soporte de la wallet, ni un "agente" que te escribe por Telegram.
- Guárdala fuera de línea (en papel, en un lugar seguro). No la fotografíes ni la guardes en la nube.

### Buenas prácticas

- Activa la verificación en dos pasos (2FA) con una aplicación de autenticación en el exchange y en el casino.
- Usa contraseñas distintas para cada servicio.
- Entra en el casino y en el exchange escribiendo la dirección o desde marcadores guardados; desconfía de enlaces recibidos por mensaje.
- Mantén separado el dinero destinado a jugar del resto de tus ahorros.

## Impuestos y normativa

El tratamiento fiscal de las criptomonedas y de los premios de juego depende de cada país. Infórmate de la normativa de tu país o consulta a un profesional.

> Que un depósito en cripto sea rápido y discreto no lo hace menos real. Fija un presupuesto antes de depositar y respétalo.`,
  },
  {
    slug: "que-es-el-rtp-y-la-ventaja-de-la-casa",
    title: "Qué es el RTP y la ventaja de la casa (y qué no te dicen)",
    description:
      "Cómo se calcula el RTP, por qué la casa siempre tiene ventaja a largo plazo, la diferencia entre RTP y volatilidad, y ejemplos con ruleta, blackjack y tragamonedas.",
    icon: "📊",
    published: "2026-09-28",
    updated: "2026-10-01",
    readingMinutes: 7,
    body: `Si has visto que una tragamonedas tiene un "RTP del 96%", quizá pensaste que recuperarás 96 de cada 100 que apuestes. No exactamente. El RTP es un concepto útil para comparar juegos, pero se malinterpreta con frecuencia. Aquí te explicamos qué significa de verdad.

## Definición: RTP y ventaja de la casa

**RTP** (*Return to Player*, retorno al jugador) es el porcentaje del total apostado que un juego devuelve en premios **en teoría, a lo largo de un número enorme de jugadas**. Un RTP del 96% significa que, si se jugaran millones de rondas, el juego pagaría en premios aproximadamente el 96% de todo lo apostado.

La **ventaja de la casa** (*house edge*) es la otra cara: 100% − RTP. Con un RTP del 96%, la ventaja de la casa es del 4%. Es la parte de cada apuesta que el casino espera quedarse a largo plazo y la razón por la que un casino es un negocio rentable.

## Lo que el RTP no significa

- **No es lo que vas a recuperar tú en una sesión.** En el corto plazo los resultados pueden alejarse mucho del RTP, en ambas direcciones. Puedes perder todo tu saldo en un juego con RTP del 97% o ganar mucho en uno con RTP del 94%.
- **No se "compensa".** Si llevas muchas rondas sin premio, el juego no "debe" pagar pronto. Cada ronda es independiente y la probabilidad es la misma. Pensar lo contrario se conoce como la **falacia del jugador**.
- **No es una garantía de que el casino sea honesto.** El RTP es teórico; la confianza viene de que el juego esté certificado y de que el casino tenga licencia.

## Cómo se calcula: el ejemplo de la ruleta

La ruleta permite ver la ventaja de la casa con números exactos.

**Ruleta europea** (un solo cero): hay 37 casillas (del 0 al 36). Una apuesta a un número paga 35 a 1.

- Si apuestas 1 USD a un número en cada una de las 37 casillas posibles, ganas una vez: recibes 35 de ganancia más tu 1 USD apostado, es decir, 36 USD de los 37 apostados.
- Pérdida = 1 de cada 37 = **2,70%** de ventaja de la casa (RTP del 97,30%).

**Ruleta americana** (cero y doble cero): hay 38 casillas, pero el pago sigue siendo 35 a 1.

- Recibes 36 de cada 38 apostados. Pérdida = 2 de cada 38 = **5,26%** de ventaja de la casa.

Mismo juego, mismos pagos, el doble de ventaja para la casa solo por una casilla más. Si puedes elegir, la ruleta europea es mejor para el jugador. (Algunas mesas ofrecen además reglas como *la partage*, que reducen la ventaja en las apuestas a la par.)

## Ventaja de la casa en juegos conocidos

| Juego | Ventaja de la casa aproximada |
| Blackjack con estrategia básica | Alrededor del 0,5% o menos, según las reglas de la mesa |
| Baccarat: apuesta a la banca | 1,06% (con comisión del 5%) |
| Baccarat: apuesta al jugador | 1,24% |
| Baccarat: apuesta al empate (pago 8 a 1) | 14,36% |
| Ruleta europea | 2,70% |
| Ruleta americana | 5,26% |
| Tragamonedas online | Depende del juego: consulta su RTP |

En el blackjack, la ventaja indicada solo se consigue jugando cada mano según la **estrategia básica**; si juegas por intuición, la ventaja de la casa aumenta. Reglas como el pago de 6 a 5 en el blackjack natural (en lugar de 3 a 2) también la empeoran notablemente.

## Tragamonedas: RTP y volatilidad

En las tragamonedas, el RTP lo fija el diseño del juego (los símbolos, su frecuencia y la tabla de pagos). Lo publica el proveedor y normalmente puedes verlo en la pantalla de información o de ayuda del juego.

Un detalle importante: **algunos proveedores ofrecen el mismo juego en varias versiones de RTP**, y es el casino quien elige cuál instalar. Por eso el mismo título puede tener un RTP distinto en dos casinos. Si el dato te importa, compruébalo en la pantalla de información del juego dentro de cada casino.

### Volatilidad

La **volatilidad** (o varianza) describe cómo se reparten los premios, no cuánto se devuelve en total:

- **Volatilidad baja**: premios pequeños y frecuentes. El saldo sube y baja poco a poco.
- **Volatilidad alta**: muchas rondas sin premio y, de vez en cuando, premios grandes. El saldo puede agotarse rápido.

Dos juegos con el mismo RTP pueden ofrecer experiencias muy diferentes. Si tu presupuesto es pequeño, la volatilidad alta aumenta la probabilidad de quedarte sin saldo antes de ver un premio.

## Cómo usar la ventaja de la casa para estimar el coste de jugar

La fórmula de la **pérdida esperada** es sencilla:

- Pérdida esperada = total apostado × ventaja de la casa.

**Ejemplo.** Haces 500 giros de 1 USD en una tragamonedas con RTP del 96%.

- Total apostado = 500 USD (aunque tu saldo inicial sea mucho menor, porque vuelves a apostar lo que ganas).
- Pérdida esperada = 500 × 0,04 = **20 USD**.

Es un promedio teórico: en una sesión concreta puedes perder más, menos o ganar. Pero te da una idea útil del "precio" del entretenimiento y explica por qué los requisitos de apuesta altos hacen que los bonos valgan menos (lo vemos en la guía de [requisitos de apuesta](/guias/requisitos-de-apuesta-wagering/)).

## ¿Quién garantiza que el RTP es real?

Los juegos de casino online usan un **generador de números aleatorios** (RNG). En los mercados regulados, los juegos y sus RNG son certificados por laboratorios de pruebas independientes (como GLI, eCOGRA o iTech Labs, entre otros), que verifican que los resultados son aleatorios y que el RTP real coincide con el declarado. Jugar en casinos con licencia y con juegos de proveedores reconocidos es la mejor forma de asegurarte de que el RTP publicado es el que se aplica.

## En resumen

- El RTP es un promedio a muy largo plazo, no una promesa para tu sesión.
- La ventaja de la casa existe siempre; ninguna estrategia de apuestas la elimina.
- Elige juegos con menor ventaja de la casa si quieres que tu presupuesto dure más.
- Ten en cuenta la volatilidad, no solo el RTP.

> El juego es entretenimiento con un coste. Si alguna vez juegas para recuperar pérdidas, es momento de parar: lee nuestra guía de [juego responsable](/guias/juego-responsable-limites-y-ayuda/).`,
  },
  {
    slug: "juego-responsable-limites-y-ayuda",
    title: "Juego responsable: límites, autoexclusión y dónde pedir ayuda",
    description:
      "Herramientas para controlar el juego (límites de depósito, pausas, autoexclusión), señales de alarma y organizaciones que ofrecen ayuda gratuita en español.",
    icon: "🤝",
    published: "2026-09-30",
    updated: "2026-10-01",
    readingMinutes: 7,
    body: `Jugar en un casino debería ser una forma de entretenimiento con un coste conocido, como ir al cine. Para la mayoría de las personas lo es, pero el juego puede convertirse en un problema para cualquiera, sin importar su edad, sus ingresos o su nivel de estudios. Esta guía reúne las herramientas que tienes a tu disposición y los recursos para pedir ayuda.

## Reglas básicas antes de jugar

- **Solo mayores de 18 años** (o la edad mínima legal de tu país, si es mayor).
- **Decide un presupuesto antes de empezar** y considéralo gastado. Nunca uses dinero destinado a alquiler, comida, deudas o facturas.
- **No pidas prestado para jugar** ni uses tarjetas de crédito para cubrir pérdidas.
- **Fija un tiempo máximo** y respétalo. Las sesiones largas hacen que pierdas la noción del dinero.
- **No intentes recuperar lo perdido.** Aumentar las apuestas para "recuperarte" es uno de los caminos más rápidos hacia pérdidas mayores.
- **No juegues bajo los efectos del alcohol**, cuando estés triste, estresado o enojado, ni como forma de escapar de los problemas.
- Recuerda que la casa siempre tiene ventaja a largo plazo (lo explicamos en la guía sobre [el RTP y la ventaja de la casa](/guias/que-es-el-rtp-y-la-ventaja-de-la-casa/)). Ganar no es una forma de obtener ingresos.

## Herramientas que ofrecen los casinos con licencia

Los casinos con licencia suelen ofrecer estas herramientas en la configuración de tu cuenta, normalmente en un apartado de "Juego responsable". Si no las encuentras, pídelas al soporte. Un casino que no las ofrece no cumple lo mínimo exigible.

### Límites de depósito

Fijas la cantidad máxima que puedes depositar por día, semana o mes. Es la herramienta más eficaz porque actúa antes de que el dinero entre en el casino. Lo habitual es que **reducir** un límite tenga efecto inmediato y que **aumentarlo** requiera un periodo de espera, precisamente para evitar decisiones impulsivas.

### Límites de pérdida y de apuesta

Algunos casinos permiten limitar la pérdida neta en un periodo o la cantidad máxima por apuesta.

### Límites de tiempo y recordatorios

Puedes fijar una duración máxima de sesión o activar un **recordatorio de realidad**: un aviso periódico que muestra cuánto tiempo llevas jugando y cuánto has ganado o perdido.

### Pausa temporal (*cool-off*)

Bloquea tu cuenta durante un periodo corto (por ejemplo, de 24 horas a unas semanas). Útil cuando notas que necesitas distancia.

### Autoexclusión

Bloquea tu cuenta durante un periodo largo (meses o años) o de forma indefinida. Durante la autoexclusión no puedes jugar ni reabrir la cuenta, y el casino debe dejar de enviarte promociones. Si te autoexcluyes en un casino, **hazlo también en los demás** donde tengas cuenta, porque la autoexclusión de un operador internacional normalmente solo afecta a ese operador.

## Herramientas fuera del casino

- **Software de bloqueo**: programas como Gamban (de pago) o BetBlocker (gratuito) bloquean el acceso a sitios de apuestas en tus dispositivos.
- **Bloqueo en el banco**: algunos bancos y aplicaciones financieras permiten bloquear los pagos a comercios de juego. Consulta con tu entidad.
- **Controles en el exchange**: si usas criptomonedas, considera retirar el acceso rápido a fondos o mantener solo una cantidad pequeña disponible.
- **Personas de confianza**: contarle a alguien cercano que quieres reducir el juego y pedirle que te ayude a cumplir tus límites funciona mejor de lo que parece.

## Señales de alarma

Hazte estas preguntas con sinceridad. Si respondes "sí" a alguna, conviene que te detengas y busques ayuda:

- ¿Juegas más dinero o más tiempo del que tenías previsto?
- ¿Vuelves a jugar para recuperar lo que perdiste?
- ¿Has mentido a tu familia o amigos sobre cuánto juegas o cuánto pierdes?
- ¿Has pedido dinero prestado, vendido cosas o dejado de pagar facturas por el juego?
- ¿Te sientes ansioso, irritable o culpable cuando juegas o cuando intentas dejarlo?
- ¿Juegas para olvidar problemas o para sentirte mejor?
- ¿El juego te ha causado problemas en el trabajo, los estudios o tus relaciones?
- ¿Has intentado reducir el juego sin conseguirlo?

## Dónde pedir ayuda

Pedir ayuda no es un fracaso: el juego problemático es un trastorno reconocido y tiene tratamiento. Estas organizaciones ofrecen apoyo gratuito:

- **Jugadores Anónimos**: grupos de apoyo mutuo para personas con problemas de juego, con reuniones presenciales y en línea en español en muchos países. Puedes buscar reuniones en el sitio internacional de [Gamblers Anonymous](https://www.gamblersanonymous.org/) o buscando "Jugadores Anónimos" junto con el nombre de tu ciudad o país.
- **Gambling Therapy**: servicio gratuito en línea de la organización benéfica Gordon Moody, con apoyo en varios idiomas, incluido el español, mediante chat, foros y grupos: [gamblingtherapy.org](https://www.gamblingtherapy.org/).
- **GamCare**: organización británica de referencia con información y apoyo sobre el juego problemático: [gamcare.org.uk](https://www.gamcare.org.uk/). Su línea telefónica está orientada al Reino Unido, pero su material informativo es útil para cualquiera.
- **Servicios de salud de tu país**: los centros de salud mental y las líneas públicas de ayuda psicológica pueden orientarte y derivarte a tratamiento especializado.

Si estás en una situación de crisis o tienes pensamientos de hacerte daño, contacta de inmediato con el número de emergencias de tu país o acude al servicio de urgencias más cercano.

## Si te preocupa alguien cercano

- Habla con calma, sin juzgar, y en un momento tranquilo.
- Evita prestar dinero o pagar sus deudas de juego: suele prolongar el problema.
- Infórmate y busca apoyo también para ti; muchas organizaciones tienen recursos para familiares.

> Este sitio contiene enlaces a casinos y recibimos una comisión cuando te registras. Aun así, preferimos que no juegues a que juegues más de lo que puedes permitirte. Si el juego ha dejado de ser divertido, para.`,
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((g) => g.slug === slug);
}

/** Newest first. */
export function latestGuides(n = guides.length): Guide[] {
  return [...guides].sort((a, b) => b.published.localeCompare(a.published)).slice(0, n);
}
