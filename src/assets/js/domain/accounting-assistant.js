const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function normalizedAccountingText(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

export function isAccountingQuestion(value) {
  const text = normalizedAccountingText(value);
  return /\b(auxiliar|contable|contabilidad|asientos|subcuentas?|terceros?|proveedores?|csv|costos?|gastos?|gastado|documentos?|comprobantes?)\b/.test(text)
    || (/\bmovimientos\b/.test(text) && /\bcc\s*\d+\b/.test(text));
}

export function accountingQuestionFilters(question, centers = [], parties = [], batches = []) {
  const text = String(question ?? "");
  const simple = normalizedAccountingText(text);
  const explicitCenter = /\b(?:cc|centro\s+de\s+costos?)\s*[-:#]?\s*(\d{1,5})\b/i.exec(text)?.[1]
    ?? /\b(\d{5})\b/.exec(text)?.[1];
  const uniqueCenters = [...new Set(centers.map((row) => row.cost_center))];
  const costCenter = explicitCenter ? uniqueCenters.find((code) => code === explicitCenter)
    ?? uniqueCenters.find((code) => /^\d+$/.test(code) && Number(code) === Number(explicitCenter))
    ?? explicitCenter : null;
  const account = /\b(?:subcuenta|cuenta)\s*[-:#]?\s*(\d{4,8})\b/i.exec(text)?.[1]
    ?? /\bclase\s*([567])\b/i.exec(text)?.[1] ?? null;
  const knownParty = [...parties].sort((a, b) => b.third_party_name.length - a.third_party_name.length)
    .find((row) => {
      const name = normalizedAccountingText(row.third_party_name);
      return name.length >= 5 && (` ${simple} `).includes(` ${name} `);
    });
  const explicitParty = /\bproveedor(?:a)?\s*(?::|llamado|de)?\s+(.+?)(?:\s+en\s+(?:cc|el\s+centro)|\s+de\s+la\s+cuenta|[?!.]|$)/i.exec(text)?.[1]?.trim();
  const party = knownParty?.third_party_name ?? (explicitParty && !/^(?:en general|que|cuales|tiene|tienen|hay|de|es)\b/i.test(explicitParty) ? explicitParty : null);
  const doc = /\b(?:documento|comprobante)\s*(?:n[uú]mero|n[°º.]?)?\s*[-:#]?\s*([\w-]{2,})\b/i.exec(text)?.[1] ?? null;
  const quoted = /[“"]([^”"]{3,})[”"]/.exec(text)?.[1] ?? null;
  const monthIndex = months.findIndex((month) => simple.includes(month));
  const latestYear = Math.max(...batches.map((row) => Number(row.report_period?.match(/\d{4}/)?.[0])).filter(Number.isFinite));
  const year = Number(/\b(20\d{2})\b/.exec(text)?.[1] ?? latestYear);
  const dateFrom = monthIndex >= 0 && year > 0 ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-01` : null;
  const dateTo = dateFrom ? `${year}-${String(monthIndex + 1).padStart(2, "0")}-${new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()}` : null;
  return {
    filters: { costCenter, account, party, search: doc ?? quoted, dateFrom, dateTo },
    context: { requestedCenter: explicitCenter, party: party ?? null, account, dateFrom, search: doc ?? quoted }
  };
}
