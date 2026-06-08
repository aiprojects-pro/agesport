// services/csv.js
// Helpers de CSV (RFC 4180, separador coma). Compartidos por la
// importación masiva y la exportación de socios.

// Parsea una línea CSV en un array de campos.
// Maneja comillas dobles, escapes "" y comas dentro de comillas.
function parseLine(line) {
  const out = [];
  let curr = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      curr += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(curr);
      curr = '';
      continue;
    }
    curr += ch;
  }
  out.push(curr);
  return out;
}

// Caracteres que Excel/Numbers/LibreOffice interpretan como inicio de
// fórmula. Si una celda empieza por uno de éstos, prefixamos un single-
// quote (truco estándar de hojas de cálculo) — la fórmula deja de
// evaluarse pero el contenido sigue legible. Sin esto, un socio con
// `nombre = '=cmd|"/c calc"!A1'` ejecutaría calc.exe en la máquina
// del admin al abrir el export.
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

// Escapa un valor para CSV: quotea si contiene coma, comilla o salto de
// línea; duplica las comillas internas; neutraliza fórmulas (CSV/Excel
// injection). Valores null/undefined se serializan como vacío.
function escape(val) {
  if (val === null || val === undefined) return '';
  let s = String(val);
  if (s.length > 0 && FORMULA_PREFIXES.includes(s[0])) {
    s = "'" + s;
  }
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

module.exports = { parseLine, escape };
