import type { DataSource, Merchant, SourceKind } from '@prisma/client';

/** One validated, normalized offer from a source, ready to upsert. */
export type NormalizedOffer = {
  retailerSku: string;
  title: string;
  brand: string | null;
  mpn: string | null;
  gtin: string | null; // 14 digits, check digit verified
  categorySlug: string;
  description: string | null;
  attributes: Record<string, string> | null;
  imageUrl: string | null;
  price: number; // what the shopper pays now
  listPrice: number | null; // only when the source provides one, and it is higher
  currency: 'USD';
  inStock: boolean;
  condition: 'new' | 'refurbished' | 'used';
  url: string;
  deliveryNote: string | null;
  checkedAt: Date; // when the source says the price was current
};

export type RowError = { row: number; code: string; message: string };

export type AdapterContext = {
  source: DataSource;
  merchant: Merchant;
  categories: Set<string>; // valid Vault category slugs
  now: Date;
};

export type RawRow = { line: number; data: Record<string, string> };

/**
 * A provider adapter turns a source's raw data into normalized offers.
 * Only authorized sources get an adapter; unapproved providers stay AWAITING_APPROVAL with no adapter.
 */
export interface ProviderAdapter<Input> {
  readonly kind: SourceKind;
  /** Yields pages of raw rows. API adapters paginate here (respecting rate limits); a file is one page. */
  pages(input: Input, ctx: AdapterContext): AsyncIterable<RawRow[]>;
  /** Validates and normalizes one row. Never guesses: anything unclear is rejected with a reason. */
  normalize(row: RawRow, ctx: AdapterContext): { ok: NormalizedOffer } | { error: RowError };
}

/** Fields a source's permission record can allow. Title, price and url are always required. */
export const PERMITTABLE_FIELDS = ['title', 'price', 'url', 'list_price', 'brand', 'identifiers', 'description', 'image', 'delivery', 'attributes'] as const;
export const REQUIRED_FIELDS = ['title', 'price', 'url'] as const;
