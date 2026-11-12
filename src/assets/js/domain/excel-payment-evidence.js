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

// Criterio de SOINSOLAR para este libro: los importes mensuales registrados
// representan anticipos recibidos, salvo que una nota de pago más específica
// indique otra cifra. Una nota sin mes no se asigna a uno arbitrariamente.
export function deriveHistoricalCollection({ contractValue, billedTotal = 0, monthlyBilled = {}, notes = [] } = {}) {
  const contract = Number(contractValue);
  const billed = Number(billedTotal);
  const monthly = Object.fromEntries(Object.entries(monthlyBilled || {})
    .filter(([month, value]) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month) && Number(value) !== 0)
    .map(([month, value]) => [month, Number(value)]));
  const rounded = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
  const monthlySum = rounded(Object.values(monthly).reduce((sum, value) => sum + value, 0));
  const review = [];
  if (Object.values(monthly).some((value) => value < 0)) {
    return { collectedTotal: null, monthlyCollected: {}, undatedCollected: 0,
      basis: "Nota crédito en la facturación mensual; recaudo por conciliar", review: "El Excel tiene un ajuste negativo. No se infiere un egreso de caja." };
  }
  const signals = notes.map((entry) => {
    const note = normalized(entry.text);
    const percentage = note.match(/(\d+(?:[.,]\d+)?)\s*%/);
    const percent = percentage ? Number(percentage[1].replace(",", ".")) : null;
    if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) return null;
    const pending = /\bpend\w*\s+(?:(?:de\s+)?(?:pago|cobrar|cobrer))\b|\bpend\w*\s+facturar\s*[-–]\s*cobrar\b/.test(note);
    if (pending) return { kind: "pending", percent, entry };
    if (/\bya\s+pago\b|\bpago(?:\s+al)?\s*\d+(?:[.,]\d+)?\s*%|\bse\s+recibio\s+anticipo\b/.test(note)) {
      return { kind: "paid", percent: percent ?? (/ya\s+pago\b/.test(note) ? 100 : null), entry };
    }
    return null;
  }).filter(Boolean);
  const latest = signals.at(-1);
  let collectedTotal = null;
  let monthlyCollected = {};
  let basis = "Sin importe de recaudo indicado en el Excel";
  if (latest && contract > 0 && latest.percent != null) {
    collectedTotal = rounded(contract * (latest.kind === "pending" ? 100 - latest.percent : latest.percent) / 100);
    basis = `${latest.entry.sheet}, fila ${latest.entry.row}: ${latest.entry.text}. Importe calculado sobre el contrato.`;
    if (monthlySum > collectedTotal + 0.01) {
      review.push("El porcentaje de pago de la nota es menor que los importes mensuales; falta conciliar los meses de recaudo.");
    } else monthlyCollected = monthly;
  } else if (latest?.kind === "pending") {
    // Si falta cobrar una parte sin importe, solo los anticipos por mes son cuantificables.
    if (monthlySum > 0) {
      collectedTotal = monthlySum;
      monthlyCollected = monthly;
      basis = `Anticipos mensuales del Excel; ${latest.entry.sheet}, fila ${latest.entry.row}: ${latest.entry.text}.`;
    } else basis = `${latest.entry.sheet}, fila ${latest.entry.row}: ${latest.entry.text}. Pendiente sin importe recibido cuantificable.`;
  } else if (latest?.kind === "paid" && contract > 0 && latest.percent == null) {
    // Un pago sin porcentaje no permite cuantificar el importe.
    basis = `${latest.entry.sheet}, fila ${latest.entry.row}: ${latest.entry.text}. Importe por conciliar.`;
  } else if (Number.isFinite(billed) && billed > 0) {
    collectedTotal = rounded(billed);
    monthlyCollected = monthly;
    basis = "Importes de facturación del Excel tratados como anticipos recibidos según el criterio de SOINSOLAR.";
  }
  if (signals.length > 1 && signals.at(-2)?.kind !== latest?.kind) {
    review.push("Las notas de pago cambian entre hojas; se aplicó la última anotación pertinente del seguimiento.");
  }
  const assigned = rounded(Object.values(monthlyCollected).reduce((sum, value) => sum + value, 0));
  return { collectedTotal, monthlyCollected, undatedCollected: collectedTotal == null ? 0 : rounded(Math.max(collectedTotal - assigned, 0)),
    basis, review: review.join(" ") };
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
