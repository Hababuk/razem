// Polish receipt (paragon) text from OCR -> items with unit prices.
// OCR of a photographed receipt is messy, so this reads each line loosely:
//   "MlekoLaciate 1L  C 2 x3,49  6,98C"      quantity x unit price (the total column is ignored — OCR often garbles it)
//   "Mleko UHT 1L     2-* 3,29   6,58 C"     Lidl-style separators (*, -*, ×, X)
//   "Banany luz       5,13 C" + "0,856 x 5,99"  single price, with the weight line underneath
//   "Pieczywo         1,96 C"                single price only
const SKIP = /(SUMA|PTU|RAZEM|RABAT|OPUST|PROMOC|KUPON|LIDL ?PLUS|KARTA|GOT[OÓ]WK|RESZTA|NIP|PARAGON|FISKALN|SPRZEDA|OPODATK|KASA|KASJER|NR ?SYS|NR ?WYDR|VAT|ZAP[LŁ]ACON|DO ZAP|WYDANO|PLATNO|PŁATNO|TRANSAKC|TERMINAL|BLIK|ZWROT|KAUCJ|STOPKA|DZI[EĘ]KUJ)/i;
const STOP = /^\s*(SUMA\b|SUMA PLN|RAZEM\b|DO ZAP)/i;
const NUM = String.raw`\d{1,4}(?:[.,]\d{1,3})?`, PRICE = String.raw`\d{1,5}[.,]\d{2}`;
const QX = new RegExp(String.raw`(?:^|\s)(?:[A-G]\s+)?(${NUM})\s*(?:szt\.?|kg|op\.?)?\s*x\s*(${PRICE})`, 'i');
const SINGLE = new RegExp(String.raw`^(.*?\S)\s+(?:[A-G]\s+)?(-?${PRICE})\s*[A-G]?\W*$`, 'i');
const num = s => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
const hasWord = s => /[a-ząćęłńóśźż]{3}/i.test(s);

function norm(line) {
  return line
    .replace(/[|\]\[{}]/g, ' ')
    .replace(/(\d)\s*[-–]?\s*[*×хX✕]\s*[-–]?\s*(\d)/g, '$1 x $2')   // 2-* 3,29 / 2×3,29 / 2 X 3,29 → 2 x 3,29
    .replace(/(\d)\s*x(\d)/gi, '$1 x $2')
    .replace(/(\d)\s+([.,])\s*(\d{2})\b/g, '$1$2$3')                 // "6 ,49" → "6,49"
    .replace(/(\d)([.,])\s+(\d{2})\b/g, '$1$2$3')                    // "6, 49" → "6,49"
    .replace(/\s{2,}/g, ' ').trim();
}
function tidy(s) {
  s = s.replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, '$1 $2')        // GluedCamelCase → words
    .replace(/([a-ząćęłńóśźż])(\d)/gi, '$1 $2')
    .replace(/\s+[A-G]$/, '').replace(/\s{2,}/g, ' ').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseReceipt(text) {
  const up = text.toUpperCase();
  const store = /LIDL/.test(up) ? 'lidl' : /BIEDRONK|JERONIMO/.test(up) ? 'biedronka' : null;
  let lines = text.split(/\r?\n/).map(norm).filter(Boolean);
  const start = lines.findIndex(l => /PARAGON\s*FISKALNY/i.test(l));
  if (start >= 0) lines = lines.slice(start + 1);
  const items = [];
  let pendingName = '', last = null;
  for (const line of lines) {
    if (STOP.test(line)) break;                                      // payment and tax lines follow the total
    if (SKIP.test(line)) { pendingName = ''; last = null; continue; }
    const q = line.match(QX);
    if (q) {
      const before = line.slice(0, q.index).replace(/\s+[A-G]\s*$/, '').trim();
      const qty = num(q[1]), unit = num(q[2]);
      if (!(unit > 0 && unit < 2000 && qty > 0 && qty < 100)) continue;
      if (hasWord(before)) { last = { raw: before, name: tidy(before), qty, unit }; items.push(last); }
      else if (pendingName) { last = { raw: pendingName, name: tidy(pendingName), qty, unit }; items.push(last); }
      else if (last && last.single) { last.qty = qty; last.unit = unit; last.single = false; } // Lidl: weight line under the item
      pendingName = '';
      continue;
    }
    const m = line.match(SINGLE);
    if (m && hasWord(m[1]) && !/\d{2}[-./]\d{2}[-./]\d{2,4}/.test(line)) {
      const price = num(m[2]);
      if (price > 0 && price < 2000) { last = { raw: m[1], name: tidy(m[1]), qty: 1, unit: price, single: true }; items.push(last); }
      pendingName = ''; continue;
    }
    pendingName = hasWord(line) && !/\d[.,]\d{2}/.test(line) ? line : '';
  }
  return { store, items: items.map(({ single, ...i }) => ({ ...i, total: Math.round(i.qty * i.unit * 100) / 100 })) };
}
