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
    definition: "Dinero que el productor o alguien que confía en él (una cooperativa, su familia) deja como garantía. Si no cumple, se usa para devolverte.",
  },
  verificador: {
    term: "Verificador",
    definition: "Una persona o institución independiente que revisa la evidencia de avance y decide las disputas. No puede quedarse con el dinero.",
  },
  dolares: {
    term: "Dólares digitales",
    definition: "USDC, un dólar digital estable: 1 USDC vale 1 $us. El precio queda fijo en dólares aunque cambie el boliviano. Esta demo usa USDC de prueba de la testnet, sin valor real.",
  },
  fondo: {
    term: "Fondo común",
    definition: "Un fondo de todos, que se forma con una pequeña parte de cada pago a productores (el porcentaje está en Transparencia). Ayuda a cubrir los reembolsos cuando la custodia y el aval no alcanzan; cada caso puede usar solo una parte del fondo.",
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
