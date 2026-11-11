// El libro contiene menciones de pago en notas, sin columna de recaudo,
// importe comprobado ni fecha. Se conservan como evidencia, nunca como caja.
const paymentWords = /\b(pago|pagad\w*|anticipo|recibi\w*|cancelad\w*)\b/i;

function normalized(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function extractPaymentEvidence(notes = []) {
  return notes.filter((note) => paymentWords.test(normalized(note.text)))
    .map(({ sheet, row, text }) => ({ sheet, row, text }));
}

export function paymentEvidenceHeadline(evidence = []) {
  if (!evidence.length) return "Sin dato de recaudo en el Excel";
  const august = evidence.filter((entry) => normalized(entry.sheet).includes("agosto"));
  const relevant = august.length ? august : evidence;
  if (relevant.length > 1) return `${relevant.length} referencias de pago; ver detalle`;
  const note = normalized(relevant[0].text);
  const percentage = note.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const value = percentage ? `${Number(percentage[1].replace(",", "."))} %` : "";
  if (/pend\w*\s+pago\b|pago\s+pendiente\b/.test(note)) {
    return value ? `Pago pendiente ${value} según Excel` : "Pago pendiente según Excel";
  }
  if (/\banticipo\b|\brecibio\b/.test(note)) {
    return value ? `Anticipo recibido ${value} según Excel` : "Anticipo recibido según Excel";
  }
  if (/\bya\s+pago\b|\bpago\s+(?:al\s+)?100\s*%|\bcancelad\w*\s+(?:al\s+)?100\s*%/.test(note)) {
    return "Pago completo informado en Excel";
  }
  if (value) return `Pago ${value} informado en Excel`;
  return "Mención de pago en el Excel; ver detalle";
}

export function contractPosition(contractValue, invoicedValue, known = true) {
  if (!known || !Number.isFinite(Number(contractValue)) || Number(contractValue) <= 0) {
    return { kind: "unknown", amount: null };
  }
  const difference = Math.round((Number(contractValue) - Number(invoicedValue || 0)) * 100) / 100;
  return difference < 0 ? { kind: "excess", amount: -difference }
    : difference > 0 ? { kind: "remaining", amount: difference }
      : { kind: "settled", amount: 0 };
}
