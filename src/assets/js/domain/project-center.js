// El centro original sigue al comienzo del identificador provisional. El
// sufijo identifica la fila sin atribuir al proyecto un centro no confirmado.
export function displayProjectCenter(value) {
  const code = String(value ?? "");
  const match = /^(\d+)-EXCEL-(FV|AGO|VIS)(\d+)$/.exec(code);
  if (!match) return code;
  const sheet = { FV: "PROYECTOS FV", AGO: "AGOSTO", VIS: "VISITAS Y OTROS" }[match[2]];
  return `${match[1]} · Excel ${sheet}, fila ${match[3]} (código provisional)`;
}
