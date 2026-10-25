/** Normalizes a GTIN/UPC/EAN to 14 digits. Returns null unless the length and check digit are valid. */
export function normalizeGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return null;
  const g = digits.padStart(14, '0');
  if (/^0+$/.test(g)) return null;
  const sum = [...g.slice(0, 13)].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(g[13]) ? g : null;
}

/** "WH-1000XM5 / B" -> "WH1000XM5B". Used only together with the brand to match products. */
export const mpnKey = (mpn: string | null | undefined) => {
  const k = (mpn ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k.length >= 3 ? k : null;
};

export const brandKey = (brand: string | null | undefined) => {
  const k = (brand ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return k || null;
};

export const cleanText = (s: string | null | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
};

/** "$1,299.00", "1299", "1.299,00 USD" style values -> 1299. Returns null if not a positive amount. */
export function parseMoney(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s || s.startsWith('-')) return null;
  // "1.299,00" (comma decimal) vs "1,299.00" (dot decimal)
  if (/,\d{2}$/.test(s) && s.indexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const OUT = /^(out[ _-]?of[ _-]?stock|oos|sold[ _-]?out|unavailable|discontinued|no|false|0)$/i;
const IN = /^(in[ _-]?stock|available|yes|true|1|limited|low[ _-]?stock|preorder|pre-order|backorder)$/i;

/** Returns null when the value isn't understood (so the row can be rejected instead of guessed). */
export function parseAvailability(raw: string | null | undefined): boolean | null {
  if (!raw) return true; // feeds commonly omit the column for in-stock items
  if (OUT.test(raw.trim())) return false;
  if (IN.test(raw.trim())) return true;
  return null;
}

export function parseCondition(raw: string | null | undefined): 'new' | 'refurbished' | 'used' | null {
  const v = (raw ?? 'new').trim().toLowerCase();
  if (!v || v === 'new') return 'new';
  if (/refurb|renewed/.test(v)) return 'refurbished';
  if (/used|pre-?owned|open box/.test(v)) return 'used';
  return null;
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'item';
