import type { CommissionStatus } from '@prisma/client';

export type ReportConfig = { columns?: Record<string, string>; statusMap?: Record<string, string> } | null;

export type ReportRow = {
  externalId: string;
  subId: string | null;
  status: CommissionStatus;
  saleAmount: number | null;
  amount: number; // always >= 0
  currency: 'USD';
  occurredAt: Date;
};

export const REPORT_ALIASES: Record<string, string[]> = {
  id: ['transaction_id', 'action_id', 'order_id', 'conversion_id', 'id', 'transactionid', 'actionid'],
  subid: ['sub_id', 'subid', 'sub_id1', 'subid1', 'sub1', 'click_id', 'clickid', 'sharedid', 'tracking_id_sub'],
  status: ['status', 'state', 'action_status', 'commission_status'],
  sale: ['sale_amount', 'saleamount', 'order_value', 'sale', 'revenue', 'order_amount'],
  commission: ['commission', 'commission_amount', 'commissionamount', 'payout', 'earnings'],
  date: ['date', 'event_date', 'transaction_date', 'action_date', 'occurred_at', 'created_at', 'click_date'],
  currency: ['currency'],
};

const DEFAULT_STATUS: [RegExp, CommissionStatus][] = [
  [/^(paid|paid[ _-]?out|settled)$/, 'PAID'],
  [/^(reversed|rejected|declined|cancel+ed|returned|voided|denied|invalid)$/, 'REVERSED'],
  [/^(approved|locked|confirmed|validated|accepted|payable)$/, 'APPROVED'],
  [/^(pending|open|new|received|tracked|processing|unconfirmed)$/, 'PENDING'],
];

export const STATUS_RANK: Record<CommissionStatus, number> = { PENDING: 0, APPROVED: 1, PAID: 2, REVERSED: 3 };

export function mapReportHeaders(headers: string[], config: ReportConfig): Record<string, string | undefined> {
  const set = new Set(headers);
  const out: Record<string, string | undefined> = {};
  for (const [field, aliases] of Object.entries(REPORT_ALIASES)) {
    const configured = config?.columns?.[field]?.trim().toLowerCase();
    out[field] = configured && set.has(configured) ? configured : aliases.find((a) => set.has(a));
  }
  return out;
}

/** "$12.50", "(3.20)", "-3.20", "1.234,50" -> number (negative allowed: reversals). Null if not a number. */
export function parseSignedMoney(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  let s = raw.trim();
  const paren = /^\(.*\)$/.test(s);
  s = s.replace(/[^\d.,-]/g, '');
  const neg = paren || s.startsWith('-');
  s = s.replace(/-/g, '');
  if (!s) return null;
  if (/,\d{2}$/.test(s) && s.indexOf('.') < s.lastIndexOf(',')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}

export function mapStatus(raw: string, config: ReportConfig): CommissionStatus | null {
  const key = raw.trim().toLowerCase();
  const custom = config?.statusMap?.[key]?.toUpperCase();
  if (custom && custom in STATUS_RANK) return custom as CommissionStatus;
  return DEFAULT_STATUS.find(([re]) => re.test(key))?.[1] ?? null;
}

/** Validates one report row. Never guesses: unknown statuses, bad dates or missing IDs are rejected with a reason. */
export function parseReportRow(
  data: Record<string, string>,
  cols: Record<string, string | undefined>,
  config: ReportConfig,
  now: Date,
): { ok: ReportRow } | { error: { code: string; message: string } } {
  const get = (f: string) => (cols[f] ? (data[cols[f]!] ?? '').trim() : '');
  const fail = (code: string, message: string) => ({ error: { code, message } });

  const externalId = get('id').slice(0, 120);
  if (!externalId) return fail('MISSING_ID', 'No transaction ID.');

  const rawAmount = parseSignedMoney(get('commission'));
  if (rawAmount === null) return fail('BAD_COMMISSION', `Commission "${get('commission')}" isn't an amount.`);

  let status: CommissionStatus | null;
  if (get('status')) {
    status = mapStatus(get('status'), config);
    if (!status) return fail('UNKNOWN_STATUS', `Status "${get('status')}" isn't recognized. Add it to the program's status mapping.`);
  } else status = rawAmount < 0 ? 'REVERSED' : null;
  if (!status) return fail('MISSING_STATUS', 'No status column, so the row can\'t be classified.');
  // A negative commission is a reversal by definition.
  if (rawAmount < 0) status = 'REVERSED';

  const dateText = get('date');
  const occurredAt = new Date(dateText);
  if (!dateText || Number.isNaN(occurredAt.getTime())) return fail('BAD_DATE', `Date "${dateText}" isn't valid.`);
  if (occurredAt.getTime() > now.getTime() + 864e5) return fail('FUTURE_DATE', 'The date is in the future.');

  const currency = (get('currency') || 'USD').toUpperCase();
  if (currency !== 'USD') return fail('UNSUPPORTED_CURRENCY', `Currency ${currency} isn't supported (USD only).`);

  const sale = parseSignedMoney(get('sale'));
  return {
    ok: {
      externalId,
      subId: get('subid').slice(0, 80) || null,
      status,
      saleAmount: sale == null ? null : Math.abs(sale),
      amount: Math.abs(rawAmount),
      currency: 'USD',
      occurredAt,
    },
  };
}
