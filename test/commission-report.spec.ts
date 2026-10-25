import { mapReportHeaders, mapStatus, parseReportRow, parseSignedMoney } from '../src/affiliate/commission-report';

const NOW = new Date('2026-11-01T12:00:00Z');
const headers = ['transaction_id', 'sub_id', 'status', 'sale_amount', 'commission', 'date'];
const cols = mapReportHeaders(headers, null);
const row = (over: Record<string, string> = {}) => ({ transaction_id: 'T1', sub_id: 'abc123', status: 'approved', sale_amount: '$120.00', commission: '$6.00', date: '2026-10-20', ...over });

describe('commission report rows', () => {
  it('parses a good row', () => {
    const r = parseReportRow(row(), cols, null, NOW);
    // A date without a time is that calendar day (stored at noon UTC so US time zones show the same day).
    expect('ok' in r && r.ok).toEqual({ externalId: 'T1', subId: 'abc123', status: 'APPROVED', saleAmount: 120, amount: 6, currency: 'USD', occurredAt: new Date('2026-10-20T12:00:00Z') });
  });

  it('keeps full timestamps as given', () => {
    const r = parseReportRow(row({ date: '2026-10-20T03:15:00Z' }), cols, null, NOW);
    expect('ok' in r && r.ok.occurredAt).toEqual(new Date('2026-10-20T03:15:00Z'));
  });

  it('maps common network statuses, and lets a program override them', () => {
    for (const [raw, status] of [['Pending', 'PENDING'], ['locked', 'APPROVED'], ['Confirmed', 'APPROVED'], ['paid out', 'PAID'], ['Cancelled', 'REVERSED'], ['returned', 'REVERSED']] as const) {
      expect(mapStatus(raw, null)).toBe(status);
    }
    expect(mapStatus('mystery', null)).toBeNull();
    expect(mapStatus('Mystery', { statusMap: { mystery: 'approved' } })).toBe('APPROVED');
  });

  it('treats a negative commission as a reversal and stores positive amounts', () => {
    const r = parseReportRow(row({ commission: '($6.00)', status: 'approved' }), cols, null, NOW);
    expect('ok' in r && r.ok).toMatchObject({ status: 'REVERSED', amount: 6 });
    expect(parseSignedMoney('-3.20')).toBe(-3.2);
    expect(parseSignedMoney('1.234,50')).toBe(1234.5);
    expect(parseSignedMoney('n/a')).toBeNull();
  });

  it.each([
    ['no transaction ID', { transaction_id: '' }, 'MISSING_ID'],
    ['bad commission', { commission: 'tbd' }, 'BAD_COMMISSION'],
    ['unrecognized status', { status: 'in review' }, 'UNKNOWN_STATUS'],
    ['bad date', { date: 'last tuesday' }, 'BAD_DATE'],
    ['future date', { date: '2027-01-01' }, 'FUTURE_DATE'],
  ])('rejects %s instead of guessing', (_l, over, code) => {
    const r = parseReportRow(row(over), cols, null, NOW);
    expect('error' in r && r.error.code).toBe(code);
  });

  it('uses configured column names', () => {
    const custom = ['order #', 'result', 'earned', 'when'];
    const config = { columns: { id: 'order #', status: 'result', commission: 'earned', date: 'when' } };
    const c = mapReportHeaders(custom, config);
    const r = parseReportRow({ 'order #': 'A9', result: 'Locked', earned: '2.50', when: '2026-10-01' }, c, config, NOW);
    expect('ok' in r && r.ok).toMatchObject({ externalId: 'A9', status: 'APPROVED', amount: 2.5, subId: null });
  });
});
