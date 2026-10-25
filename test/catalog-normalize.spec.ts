import type { DataSource, Merchant } from '@prisma/client';
import type { AdapterContext } from '../src/catalog/adapter';
import { csvRecords, parseCsv } from '../src/catalog/csv';
import { CsvFeedAdapter } from '../src/catalog/csv-feed.adapter';
import { brandKey, mpnKey, normalizeGtin, parseAvailability, parseCondition, parseMoney } from '../src/catalog/normalize';

describe('CSV parser', () => {
  it('handles quotes, escaped quotes, commas and line breaks inside fields, CRLF and BOM', () => {
    const text = '﻿sku,title,price\r\n1,"Desk, oak ""Pro""",199.00\r\n2,"Two\nlines",5\r\n\r\n';
    expect(parseCsv(text)).toEqual([
      ['sku', 'title', 'price'],
      ['1', 'Desk, oak "Pro"', '199.00'],
      ['2', 'Two\nlines', '5'],
    ]);
  });

  it('detects tab- and semicolon-separated exports and reports line numbers', () => {
    expect(csvRecords('SKU\tTitle\nA1\tLamp').records).toEqual([{ line: 2, data: { sku: 'A1', title: 'Lamp' } }]);
    expect(csvRecords('sku;title\nA1;Lamp').records[0].data).toEqual({ sku: 'A1', title: 'Lamp' });
  });

  it('refuses a file that ends inside a quoted field', () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow(/quoted field/);
  });
});

describe('normalization', () => {
  it('validates GTIN check digits and normalizes to 14 digits', () => {
    expect(normalizeGtin('036000291452')).toBe('00036000291452'); // UPC-A
    expect(normalizeGtin('4006381333931')).toBe('04006381333931'); // EAN-13
    expect(normalizeGtin('0360-0029-1452')).toBe('00036000291452');
    expect(normalizeGtin('036000291453')).toBeNull(); // wrong check digit
    expect(normalizeGtin('12345')).toBeNull();
    expect(normalizeGtin('00000000000000')).toBeNull();
  });

  it('builds matching keys for brand and MPN', () => {
    expect(mpnKey('WH-1000XM5 / b')).toBe('WH1000XM5B');
    expect(mpnKey('A1')).toBeNull(); // too short to identify anything
    expect(brandKey('  Sony®  ')).toBe('sony');
    expect(brandKey('Crème Brûlée Co.')).toBe('creme brulee co');
  });

  it('parses money in common formats and rejects nonsense', () => {
    expect(parseMoney('$1,299.00')).toBe(1299);
    expect(parseMoney('1.299,50')).toBe(1299.5);
    expect(parseMoney('19.999')).toBe(20);
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('free')).toBeNull();
    expect(parseMoney('0')).toBeNull();
  });

  it('understands availability and condition, and refuses to guess', () => {
    expect(parseAvailability('In Stock')).toBe(true);
    expect(parseAvailability('out_of_stock')).toBe(false);
    expect(parseAvailability('')).toBe(true);
    expect(parseAvailability('maybe')).toBeNull();
    expect(parseCondition('Renewed')).toBe('refurbished');
    expect(parseCondition('open box')).toBe('used');
    expect(parseCondition('mystery')).toBeNull();
  });
});

describe('CSV feed rows', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const ctx = (allowed: string[] = ['title', 'price', 'url', 'list_price', 'brand', 'identifiers', 'description', 'image', 'delivery', 'attributes'], config: unknown = null): AdapterContext => ({
    source: { id: 's1', allowedFields: allowed, config, priceFreshnessHours: 24 } as unknown as DataSource,
    merchant: { id: 'm1', domain: 'bestbuy.com' } as Merchant,
    categories: new Set(['electronics', 'home']),
    now,
  });
  const adapter = new CsvFeedAdapter();
  const row = (data: Record<string, string>) => ({
    line: 2,
    data: { sku: 'BB-1', title: 'Noise cancelling headphones', price: '349.99', sale_price: '279.99', url: 'https://www.bestbuy.com/p/1', category: 'electronics', ...data },
  });

  it('normalizes a good row, taking the sale price and keeping the regular price as "was"', () => {
    const r = adapter.normalize(row({ brand: 'Sony', mpn: 'WH-1000XM5', upc: '036000291452', color: 'Black', updated_at: '2026-10-28T08:00:00Z' }), ctx());
    expect('ok' in r && r.ok).toMatchObject({
      retailerSku: 'BB-1', price: 279.99, listPrice: 349.99, brand: 'Sony', mpn: 'WH-1000XM5', gtin: '00036000291452',
      categorySlug: 'electronics', inStock: true, condition: 'new', attributes: { color: 'Black' },
      checkedAt: new Date('2026-10-28T08:00:00Z'),
    });
  });

  it.each([
    ['missing SKU', { sku: '' }, 'MISSING_SKU'],
    ['bad price', { price: 'call us', sale_price: '' }, 'BAD_PRICE'],
    ['link on another domain', { url: 'https://bestbuy.com.evil.test/p/1' }, 'OFF_DOMAIN_URL'],
    ['plain http link', { url: 'http://www.bestbuy.com/p/1' }, 'OFF_DOMAIN_URL'],
    ['unknown category', { category: 'Gadgets' }, 'UNKNOWN_CATEGORY'],
    ['bad GTIN', { gtin: '036000291453' }, 'BAD_GTIN'],
    ['non-USD price', { currency: 'EUR' }, 'UNSUPPORTED_CURRENCY'],
    ['unclear availability', { availability: 'ask' }, 'BAD_AVAILABILITY'],
    ['bad date', { updated_at: 'yesterday-ish' }, 'BAD_DATE'],
  ])('rejects %s', (_label, data, code) => {
    const r = adapter.normalize(row(data), ctx());
    expect('error' in r && r.error.code).toBe(code);
  });

  it('drops fields the source agreement does not allow (no invented discount, no description, no image)', () => {
    const r = adapter.normalize(row({ description: 'Great', image: 'https://img.bestbuy.com/1.jpg', brand: 'Sony', gtin: '036000291452' }), ctx(['title', 'price', 'url']));
    expect('ok' in r && r.ok).toMatchObject({ price: 279.99, listPrice: null, description: null, imageUrl: null, brand: null, gtin: null });
  });

  it('never claims a "was" price lower than or equal to the price', () => {
    const r = adapter.normalize(row({ sale_price: '', list_price: '300', price: '349.99' }), ctx());
    expect('ok' in r && r.ok.listPrice).toBeNull();
  });

  it('clamps future timestamps to now', () => {
    const r = adapter.normalize(row({ updated_at: '2030-01-01T00:00:00Z' }), ctx());
    expect('ok' in r && r.ok.checkedAt).toEqual(now);
  });

  it('uses the configured column names and category map', () => {
    const config = { columns: { title: 'product title', sku: 'item #' }, categoryMap: { headphones: 'electronics' } };
    const r = adapter.normalize({ line: 3, data: { 'product title': 'Earbuds', 'item #': 'X9', price: '50', url: 'https://bestbuy.com/x9', category: 'Headphones' } }, ctx(undefined, config));
    expect('ok' in r && r.ok).toMatchObject({ retailerSku: 'X9', title: 'Earbuds', categorySlug: 'electronics' });
  });
});
