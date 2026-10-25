import { isLinkOnMerchantDomain } from '../deals/trust';
import type { AdapterContext, NormalizedOffer, ProviderAdapter, RawRow, RowError } from './adapter';
import { csvRecords } from './csv';
import { cleanText, normalizeGtin, parseAvailability, parseCondition, parseMoney } from './normalize';

/** Header names we recognize for each field (lowercase). A source can override with config.columns. */
export const COLUMN_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'retailer_sku', 'id', 'item_id', 'product_id'],
  title: ['title', 'name', 'product_name'],
  brand: ['brand', 'manufacturer'],
  mpn: ['mpn', 'model', 'model_number'],
  gtin: ['gtin', 'upc', 'ean', 'gtin13', 'barcode'],
  category: ['category', 'vault_category'],
  description: ['description'],
  price: ['price'],
  sale_price: ['sale_price'],
  list_price: ['list_price', 'was_price', 'regular_price', 'msrp'],
  currency: ['currency'],
  availability: ['availability', 'in_stock', 'stock'],
  url: ['url', 'link', 'product_url'],
  image: ['image', 'image_url', 'image_link'],
  delivery: ['delivery', 'shipping', 'shipping_note'],
  condition: ['condition'],
  updated_at: ['updated_at', 'last_updated', 'price_date'],
  color: ['color', 'colour'],
  size: ['size'],
};

type CsvConfig = { columns?: Record<string, string>; categoryMap?: Record<string, string> };

export class CsvFeedAdapter implements ProviderAdapter<{ csv: string }> {
  readonly kind = 'CSV_FEED' as const;

  async *pages(input: { csv: string }) {
    const { records } = csvRecords(input.csv);
    yield records;
  }

  /** Resolves which header holds each field: explicit config first, then known aliases. */
  static mapHeaders(headers: string[], config: CsvConfig | null): Record<string, string | undefined> {
    const set = new Set(headers);
    const out: Record<string, string | undefined> = {};
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      const configured = config?.columns?.[field]?.trim().toLowerCase();
      out[field] = configured && set.has(configured) ? configured : aliases.find((a) => set.has(a));
    }
    return out;
  }

  normalize(row: RawRow, ctx: AdapterContext): { ok: NormalizedOffer } | { error: RowError } {
    const config = (ctx.source.config as CsvConfig | null) ?? null;
    const cols = CsvFeedAdapter.mapHeaders(Object.keys(row.data), config);
    const get = (f: string) => (cols[f] ? row.data[cols[f]!] ?? '' : '');
    const allowed = new Set(ctx.source.allowedFields);
    const may = (f: string) => allowed.has(f);
    const fail = (code: string, message: string) => ({ error: { row: row.line, code, message } });

    const sku = cleanText(get('sku'), 120);
    if (!sku) return fail('MISSING_SKU', 'No SKU / product ID.');
    const title = cleanText(get('title'), 300);
    if (!title) return fail('MISSING_TITLE', 'No title.');

    const currency = (get('currency') || 'USD').toUpperCase();
    if (currency !== 'USD') return fail('UNSUPPORTED_CURRENCY', `Currency ${currency} isn't supported (USD only).`);

    const base = parseMoney(get('price'));
    const sale = parseMoney(get('sale_price'));
    if (!base && !sale) return fail('BAD_PRICE', `Price "${get('price') || get('sale_price')}" isn't a positive amount.`);
    const price = sale && (!base || sale < base) ? sale : base!;
    if (price >= 1_000_000) return fail('BAD_PRICE', 'Price is implausibly high.');
    // A "was" price only when the source states one: explicit list price, or the regular price next to a sale price.
    let listPrice = may('list_price') ? (parseMoney(get('list_price')) ?? (sale && base && sale < base ? base : null)) : null;
    if (listPrice != null && listPrice <= price) listPrice = null;

    const url = get('url');
    if (!isLinkOnMerchantDomain(url, ctx.merchant.domain)) return fail('OFF_DOMAIN_URL', `Link must be https on ${ctx.merchant.domain}.`);

    const rawCategory = get('category');
    const categorySlug = config?.categoryMap?.[rawCategory] ?? config?.categoryMap?.[rawCategory.toLowerCase()] ?? rawCategory.toLowerCase();
    if (!ctx.categories.has(categorySlug)) return fail('UNKNOWN_CATEGORY', `Category "${rawCategory}" isn't one of Vault's categories (add it to the source's category map).`);

    // Availability is part of the offer's accuracy, so it's always read (never assumed) when the feed has it.
    const inStock = parseAvailability(get('availability'));
    if (inStock === null) return fail('BAD_AVAILABILITY', `Availability "${get('availability')}" isn't recognized.`);
    const condition = parseCondition(get('condition'));
    if (!condition) return fail('BAD_CONDITION', `Condition "${get('condition')}" isn't recognized.`);

    let gtin: string | null = null;
    if (may('identifiers') && get('gtin')) {
      gtin = normalizeGtin(get('gtin'));
      if (!gtin) return fail('BAD_GTIN', `GTIN/UPC "${get('gtin')}" has the wrong length or check digit.`);
    }

    let checkedAt = ctx.now;
    if (get('updated_at')) {
      const d = new Date(get('updated_at'));
      if (Number.isNaN(d.getTime())) return fail('BAD_DATE', `Date "${get('updated_at')}" isn't valid.`);
      checkedAt = d > ctx.now ? ctx.now : d;
    }

    const image = may('image') ? get('image') : '';
    const attributes = may('attributes') ? Object.fromEntries((['color', 'size'] as const).map((k) => [k, cleanText(get(k), 60)]).filter(([, v]) => v)) : {};

    return {
      ok: {
        retailerSku: sku,
        title,
        brand: may('brand') ? cleanText(get('brand'), 80) : null,
        mpn: may('identifiers') ? cleanText(get('mpn'), 80) : null,
        gtin,
        categorySlug,
        description: may('description') ? cleanText(get('description'), 4000) : null,
        attributes: Object.keys(attributes).length ? (attributes as Record<string, string>) : null,
        imageUrl: image && /^https:\/\//i.test(image) ? image.slice(0, 1000) : null,
        price,
        listPrice,
        currency: 'USD',
        inStock,
        condition,
        url,
        deliveryNote: may('delivery') ? cleanText(get('delivery'), 120) : null,
        checkedAt,
      },
    };
  }
}
