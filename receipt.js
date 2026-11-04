// Polish receipt (paragon) text -> items. Works on OCR output, which is messy, so it is forgiving.
// Typical lines:  "Mleko UHT 3,2% 1L   C  2 x3,49  6,98C"   "MASLO EKSTRA 200G 1 * 7,49 7,49 C"   "Banany luz 0,856 x 5,99 5,13 C"
const SKIP = /\b(SUMA|PTU|RAZEM|RABAT|OPUST|PROMOCJA|KARTA|GOT[OÓ]WKA|RESZTA|NIP|PARAGON|FISKALN|SPRZEDA[ZŻ]|KASA|KASJER|NR SYS|VAT|ZAP[LŁ]ACONO|DO ZAP)/i;
const N = '(\\d{1,4}(?:[.,]\\d{1,3})?)', P = '(\\d{1,5}[.,]\\d{2})';
const LINE = new RegExp(`^(.*?\\S)\\s+(?:[A-G]\\s+)?${N}\\s*(?:szt\\.?|kg|op\\.?)?\\s*[x×х*]\\s*${P}\\s*=?\\s*(-?${P.slice(1, -1)})?\\s*[A-G]?\\s*$`, 'i');
const NUMS_ONLY = new RegExp(`^(?:[A-G]\\s+)?${N}\\s*(?:szt\\.?|kg)?\\s*[x×х*]\\s*${P}\\s*(-?${P.slice(1, -1)})?\\s*[A-G]?\\s*$`, 'i');
const num = s => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
const tidy = s => { s = s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2').replace(/([a-ząćęłńóśźż])(\d)/gi, '$1 $2').replace(/\s+[A-G]$/, '').replace(/\s{2,}/g, ' ').trim().toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };

export function parseReceipt(text) {
  const up = text.toUpperCase();
  const store = /LIDL/.test(up) ? 'lidl' : /BIEDRONK|JERONIMO/.test(up) ? 'biedronka' : null;
  const lines = text.split(/\r?\n/).map(l => l.replace(/[|]/g, ' ').trim()).filter(Boolean);
  const items = [];
  let prev = '';
  for (const line of lines) {
    if (SKIP.test(line)) { prev = ''; continue; }
    let name, q, unit, total, m = line.match(LINE);
    if (m) [, name, q, unit, total] = m;
    else if ((m = line.match(NUMS_ONLY)) && prev && !/\d[.,]\d{2}/.test(prev)) { name = prev; [, q, unit, total] = m; }
    if (name && /[a-ząćęłńóśźż]{2}/i.test(name)) {
      const qty = num(q), u = num(unit);
      if (u > 0 && u < 2000 && qty > 0 && qty < 100) items.push({ raw: name.trim(), name: tidy(name), qty, unit: u, total: total ? num(total) : Math.round(qty * u * 100) / 100 });
      prev = ''; continue;
    }
    prev = line;
  }
  return { store, items };
}
