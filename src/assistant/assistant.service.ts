import { Injectable, Logger } from '@nestjs/common';
import { DealsService } from '../deals/deals.service';

type Card = Awaited<ReturnType<DealsService['list']>>[number];
type Block = { type: string; [k: string]: unknown };
type Msg = { role: 'user' | 'assistant'; content: string | Block[] };

const SYSTEM = `You are Vault's deal assistant. You help people in the US find real, publicly advertised deals.
Rules you must always follow:
- Only recommend deals returned by the search_deals tool. Never invent products, prices, stores or links.
- Never write URLs. The app shows each deal with its verified stores and links.
- If the tool finds nothing suitable, say you couldn't find a trusted deal yet and offer to set an alert. Do not stretch.
- Mention prices exactly as the tool returned them, and that prices can change at the store.
- Be brief and friendly: 1-3 short sentences, then let the deal cards do the talking. No pressure tactics.`;

const TOOLS = [
  {
    name: 'search_deals',
    description: 'Search Vault\'s verified deals database. Returns only deals from stores that passed our trust checks.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What the person wants, e.g. "running shoes" or "SUV rental"' },
        category: { type: 'string', enum: ['electronics', 'clothing', 'beauty', 'hotels', 'car-rentals', 'concerts', 'home', 'flights'] },
        max_price: { type: 'number', description: 'Maximum price in USD, if the person gave a budget' },
      },
      required: ['query'],
    },
  },
];

@Injectable()
export class AssistantService {
  private readonly log = new Logger(AssistantService.name);
  constructor(private readonly deals: DealsService) {}

  async chat(message: string, history: Msg[] = []): Promise<{ reply: string; deals: Card[] }> {
    const text = message.slice(0, 1000);
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return this.fallback(text);
    try {
      return await this.withClaude(key, [...history.slice(-8), { role: 'user', content: text }]);
    } catch (e) {
      this.log.warn(`Claude call failed, using keyword search: ${(e as Error).message}`);
      return this.fallback(text);
    }
  }

  /** Works without an API key: plain keyword search over trusted deals. */
  private async fallback(text: string) {
    const found = await this.deals.list({ q: text, limit: 3 });
    return found.length
      ? { reply: `Here ${found.length === 1 ? 'is the best deal' : `are ${found.length} deals`} I found from verified stores. Prices can change at the store.`, deals: found }
      : { reply: "I couldn't find a trusted deal for that yet. Want me to alert you when one shows up?", deals: [] };
  }

  private async withClaude(key: string, messages: Msg[]) {
    const shown = new Map<string, Card>();
    for (let turn = 0; turn < 4; turn++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
          max_tokens: 600,
          system: SYSTEM,
          tools: TOOLS,
          messages,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { content: Block[]; stop_reason: string };

      if (data.stop_reason !== 'tool_use') {
        const reply = data.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
        // Guardrail: strip any URL the model might still write; links only come from our database.
        const safe = reply.replace(/https?:\/\/\S+/gi, '').trim();
        return { reply: safe || 'Here is what I found.', deals: [...shown.values()].slice(0, 4) };
      }

      messages.push({ role: 'assistant', content: data.content });
      const results: Block[] = [];
      for (const b of data.content.filter((x) => x.type === 'tool_use')) {
        const input = (b.input ?? {}) as { query?: string; category?: string; max_price?: number };
        const found = await this.deals.list({ q: input.query, category: input.category, maxPrice: input.max_price, limit: 5 });
        found.forEach((d) => shown.set(d.id, d));
        results.push({
          type: 'tool_result',
          tool_use_id: b.id,
          content: JSON.stringify(found.map((d) => ({ title: d.title, price: d.bestPrice, unit: d.priceUnit, was: d.originalPrice, percent_off: d.discountPct, stores: d.storeCount, category: d.category.name }))),
        });
      }
      messages.push({ role: 'user', content: results });
    }
    return { reply: 'Here is what I found from verified stores.', deals: [...shown.values()].slice(0, 4) };
  }
}
