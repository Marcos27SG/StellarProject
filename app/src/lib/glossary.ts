// Plain-language glossary shown on first use of a term (ⓘ tooltip). Spanish (Bolivia).

export const GLOSSARY = {
  vale: {
    term: "Vale",
    definition: "Tu comprobante digital de compra. Lo canjeas por el producto al recoger, y puedes regalarlo.",
  },
  custodia: {
    term: "Custodia",
    definition: "Tu pago queda guardado en un contrato de Stellar, no en manos del productor ni de Ayni. Solo sale según las reglas.",
  },
  aval: {
    term: "Aval",
    definition: "Dinero que el productor o alguien que confía en él (una cooperativa, su familia) deja como respaldo. Cubre el 100% de cada adelanto: si no cumple, se usa para devolverte. Mientras espera, gana rendimiento para quien lo dejó.",
  },
  verificador: {
    term: "Verificador",
    definition: "Una persona o institución independiente que revisa la evidencia de avance y decide las disputas. No puede quedarse con el dinero.",
  },
  dolares: {
    term: "Dólares digitales",
    definition: "USDC, un dólar digital estable: 1 USDC vale 1 $us. El precio queda fijo en dólares aunque cambie el boliviano. Esta demo usa USDC de prueba de la testnet, sin valor real.",
  },
  rendimiento: {
    term: "Rendimiento",
    definition: "Lo que gana tu pago mientras espera la entrega: el contrato lo presta en un servicio de préstamos de Stellar. Cuando recibes, se reparte entre tú y el productor; si se te devuelve, es todo tuyo. Te mostramos lo ganado hasta ahora, nunca una promesa. En la versión de prueba es un rendimiento de prueba.",
  },
  verificado: {
    term: "Productor verificado",
    definition: "Un verificador revisó su identidad (carnet, NIT o socio de una cooperativa) fuera de la app. Solo los productores verificados pueden pedir adelantos. Los documentos no se guardan en Ayni ni en la cadena: solo la marca de verificado.",
  },
  hito: {
    term: "Hito",
    definition: "Un avance verificable de la producción (por ejemplo, la compra de insumos). Si el verificador lo aprueba, el productor recibe un adelanto.",
  },
  disputa: {
    term: "Disputa",
    definition: "Si el productor dice que te entregó y no es cierto, la abres dentro del plazo. El pago se congela hasta que el verificador decida.",
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
