import Anthropic from '@anthropic-ai/sdk';
import type { AnthropicLike } from '../src/ai/client';
import type { AiUsageService, UsageEntry } from '../src/ai/usage.service';
import { AssistantService } from '../src/assistant/assistant.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { rankCandidates, type Candidate } from '../src/search/ranking';
import type { SearchResult, SearchService } from '../src/search/search.service';
import { requestFromText } from '../src/search/shopping-request';

const NOW = new Date();
const offer = (store: string, price: number, listPrice: number | null = null) => ({
  store, storeSlug: store.toLowerCase(), price, listPrice, deliveryNote: null, lastCheckedAt: new Date(NOW.getTime() - 3600_000), staleAfter: null,
});
const cand: Candidate = {
  slug: 'road-shoes', title: 'Road running shoes', categorySlug: 'clothing', categoryName: 'Clothing', brand: 'Brooks', description: null, attributesText: '', priceUnit: null,
  offers: [offer('Zappos', 58, 112), offer('Amazon', 64)],
};
const ranked = rankCandidates([cand], { ...requestFromText('running shoes'), limit: 5 }, NOW);
const result: SearchResult = { ranked: ranked[0], offers: [], card: { id: 'd1', slug: 'road-shoes', title: 'Road running shoes', bestPrice: 58 } as unknown as SearchResult['card'] };

type Block = Record<string, unknown>;
const msg = (content: Block[], stop: string, input = 1000, output = 200) =>
  ({ id: 'm', type: 'message', role: 'assistant', model: 'x', content, stop_reason: stop, usage: { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }) as unknown as Anthropic.Message;
const text = (t: string, input?: number, output?: number) => msg([{ type: 'text', text: t }], 'end_turn', input, output);
const useTool = (name: string, input: unknown, id = 't1') => msg([{ type: 'tool_use', id, name, input }], 'tool_use');

function setup(script: (Anthropic.Message | Error)[], over: { client?: AnthropicLike | null; withinBudget?: boolean } = {}) {
  const queue = [...script];
  const create = jest.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('script exhausted');
    if (next instanceof Error) throw next;
    return next;
  });
  const client: AnthropicLike | null = over.client === undefined ? { messages: { create } } : over.client;
  const records: UsageEntry[] = [];
  const usage = { withinBudget: jest.fn(async () => over.withinBudget ?? true), record: jest.fn(async (e: UsageEntry) => void records.push(e)) } as unknown as AiUsageService;
  const search = {
    search: jest.fn(async () => [result]),
    compare: jest.fn(async () => ({ items: [{ slug: 'road-shoes', bestPrice: 58, cheapestStore: 'Zappos', statedListPrice: 112, statedDiscountPercent: 48, priceHistory: null }, { slug: 'x', bestPrice: 64, cheapestStore: 'Amazon', statedListPrice: null, statedDiscountPercent: null, priceHistory: null }], highlights: {}, warnings: [], attributeKeys: [], unavailable: [] })),
  } as unknown as SearchService & { search: jest.Mock; compare: jest.Mock };
  const prisma = { merchant: { findMany: jest.fn(async () => [{ name: 'Zappos' }, { name: 'Amazon' }, { name: 'Target' }]) } } as unknown as PrismaService;
  return { svc: new AssistantService(client, search, usage, prisma), create, search, usage, records };
}

describe('assistant', () => {
  const OLD = process.env.ANTHROPIC_MODEL;
  afterEach(() => (process.env.ANTHROPIC_MODEL = OLD));

  it('runs a search tool call, answers from verified facts, and records usage', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5';
    const { svc, create, search, records } = setup([
      useTool('search_deals', { query: 'running shoes', max_price: 80 }),
      text('The Road running shoes are $58 at Zappos, 48% below the store list price of $112. Amazon has them at $64.', 1500, 120),
    ]);
    const out = await svc.chat('running shoes under $80');

    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'running shoes', maxPrice: 80 }), expect.objectContaining({ aiOnly: true }));
    expect(out.reply).toContain('$58 at Zappos');
    expect(out.deals).toEqual([result.card]);
    expect(create).toHaveBeenCalledTimes(2);

    const first = (create.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(first).toMatchObject({ model: 'claude-haiku-4-5', max_tokens: 1024, tool_choice: { type: 'auto' } });
    expect(first).not.toHaveProperty('output_config'); // older models reject effort
    const secondMessages = (create.mock.calls[1] as unknown as [{ messages: { role: string; content: unknown }[] }])[0].messages;
    const toolResult = (secondMessages[secondMessages.length - 1].content as { type: string; content: string; is_error?: boolean }[])[0];
    expect(toolResult.type).toBe('tool_result');
    expect(toolResult.is_error).toBeUndefined();
    const payload = JSON.parse(toolResult.content);
    expect(payload.deals[0]).toMatchObject({ slug: 'road-shoes', bestPrice: 58, statedDiscountPercent: 48 });
    expect(JSON.stringify(payload)).not.toMatch(/https?:|commission|affiliate|program/i); // no links, nothing commercial

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'ok', turns: 2, toolCalls: 1, inputTokens: 2500, outputTokens: 320, model: 'claude-haiku-4-5', priceKnown: true });
    expect(records[0].costUsd).toBeCloseTo((2500 * 1 + 320 * 5) / 1e6, 6);
  });

  it('sends effort only to models that support it', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-haiku-5-5';
    const { svc, create } = setup([text('Hello there.')]);
    await svc.chat('hi');
    expect((create.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ output_config: { effort: 'low' } });
  });

  it('returns invalid tool input to the model as an error and does not search', async () => {
    const { svc, search, create } = setup([useTool('search_deals', { query: 'shoes', category: 'toys', max_price: -4 }), text('Could you tell me your budget?')]);
    const out = await svc.chat('shoes');
    expect(search.search).not.toHaveBeenCalled();
    const msgs = (create.mock.calls[1] as unknown as [{ messages: { content: unknown }[] }])[0].messages;
    const tr = (msgs[msgs.length - 1].content as { is_error?: boolean; content: string }[])[0];
    expect(tr.is_error).toBe(true);
    expect(JSON.parse(tr.content).problems.join(' ')).toMatch(/category must be one of/);
    expect(out.reply).toBe('Could you tell me your budget?');
  });

  it('rejects unknown tools and malformed comparisons', async () => {
    const { svc, search, create } = setup([
      msg([{ type: 'tool_use', id: 'a', name: 'run_sql', input: { q: 'drop table' } }, { type: 'tool_use', id: 'b', name: 'compare_deals', input: { slugs: ['../etc/passwd', 'x'] } }], 'tool_use'),
      text('Sorry, I could not do that.'),
    ]);
    await svc.chat('compare things');
    expect(search.compare).not.toHaveBeenCalled();
    const msgs = (create.mock.calls[1] as unknown as [{ messages: { content: unknown }[] }])[0].messages;
    const results = msgs[msgs.length - 1].content as { is_error?: boolean; content: string }[];
    expect(results.map((r) => r.is_error)).toEqual([true, true]);
    expect(results[0].content).toMatch(/Unknown tool/);
  });

  it('compares through the tool with AI-permitted data only and returns the compared slugs', async () => {
    const { svc, search } = setup([useTool('compare_deals', { slugs: ['road-shoes', 'x'] }), text('The Road running shoes are $58 at Zappos; the other is $64 at Amazon, $6 more.')]);
    const out = await svc.chat('compare them');
    expect(search.compare).toHaveBeenCalledWith(['road-shoes', 'x'], expect.objectContaining({ aiOnly: true }));
    expect(out.compareSlugs).toEqual(['road-shoes', 'x']);
  });

  it('strips any link the model writes', async () => {
    const { svc } = setup([useTool('search_deals', { query: 'shoes' }), text('See https://evil.example/buy for the $58 deal at Zappos.')]);
    const out = await svc.chat('shoes');
    expect(out.reply).not.toMatch(/https?:/);
    expect(out.reply).toContain('$58');
  });

  it('replaces a reply that states an invented price, and records it', async () => {
    const { svc, records } = setup([useTool('search_deals', { query: 'shoes' }), text('Great news: they are only $39 at Target right now!')]);
    const out = await svc.chat('shoes');
    expect(out.reply).not.toContain('$39');
    expect(out.reply).not.toContain('Target');
    expect(out.reply).toContain('Road running shoes at $58');
    expect(out.deals).toHaveLength(1);
    expect(records[0].outcome).toBe('blocked_claim');
  });

  it('caps tool calls and forces a plain answer on the last turn', async () => {
    // A model that never stops asking for tools.
    const script = Array.from({ length: 6 }, (_, i) => useTool('search_deals', { query: 'shoes' }, `t${i}`));
    const { svc, create, search, records } = setup(script);
    const out = await svc.chat('shoes');
    expect(create).toHaveBeenCalledTimes(5); // MAX_TURNS
    expect((create.mock.calls[4] as unknown as [Record<string, unknown>])[0].tool_choice).toEqual({ type: 'none' });
    expect(search.search.mock.calls.length).toBeLessThanOrEqual(6);
    expect(records[0].outcome).toBe('limit');
    expect(out.reply).toContain('Road running shoes at $58'); // plain verified answer
  });

  it('uses keyword search, and never calls Claude, without a key', async () => {
    const { svc, create, search, records } = setup([], { client: null });
    const out = await svc.chat('running shoes under $80');
    expect(create).not.toHaveBeenCalled();
    expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ maxPrice: 80 }), expect.anything());
    expect(out.deals).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'fallback_nokey', turns: 0, costUsd: 0 });
  });

  it('stops calling Claude once the daily budget is used up', async () => {
    const { svc, create, records } = setup([text('should not be used')], { withinBudget: false });
    const out = await svc.chat('shoes');
    expect(create).not.toHaveBeenCalled();
    expect(out.deals).toHaveLength(1);
    expect(records[0].outcome).toBe('fallback_budget');
  });

  it('falls back to keyword search on API errors, recording only the error class', async () => {
    const err = new Anthropic.RateLimitError(429, undefined, 'secret message that must not be logged', new Headers());
    const { svc, records } = setup([err]);
    const out = await svc.chat('shoes');
    expect(out.deals).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'fallback_error', error: 'RateLimitError' });
    expect(JSON.stringify(records[0])).not.toContain('secret message');
  });

  it('falls back when the model refuses, and still logs the tokens it used', async () => {
    const { svc, records } = setup([msg([], 'refusal', 800, 0)]);
    const out = await svc.chat('shoes');
    expect(out.deals).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'refusal', inputTokens: 800 });
  });

  it('keeps only recent history and a bounded message', async () => {
    const { svc, create } = setup([text('Hi.')]);
    const history = Array.from({ length: 12 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: `m${i}` }));
    await svc.chat('x'.repeat(5000), history);
    const sent = (create.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0].messages;
    expect(sent).toHaveLength(9); // last 8 + the new message
    expect(sent[8].content).toHaveLength(1000);
  });
});
