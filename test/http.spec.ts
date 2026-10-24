import { Body, Controller, Module, Post, Get, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { corsOrigin } from '../src/http';
import { ASSISTANT_LIMITS, RATE_BURST, RATE_DAILY } from '../src/rate-limits';

const allowed = (list: string, origin?: string) =>
  new Promise<boolean | undefined>((resolve) => corsOrigin(list)(origin, (_e, ok) => resolve(ok)));

describe('CORS rules', () => {
  const list = 'http://localhost:3001, https://*.vercel.app';
  it('allows listed origins and wildcard subdomains', async () => {
    expect(await allowed(list, 'http://localhost:3001')).toBe(true);
    expect(await allowed(list, 'https://vault-git-main.vercel.app')).toBe(true);
    expect(await allowed(list, undefined)).toBe(true); // server-to-server calls send no Origin
  });
  it('rejects lookalikes', async () => {
    expect(await allowed(list, 'https://evil.com')).toBe(false);
    expect(await allowed(list, 'https://x.vercel.app.evil.com')).toBe(false);
    expect(await allowed(list, 'http://x.vercel.app')).toBe(false);
    expect(await allowed(list, 'http://localhost:3002')).toBe(false);
  });
});

@Controller('assistant')
@UseGuards(ThrottlerGuard)
@Throttle(ASSISTANT_LIMITS)
class FakeAssistant {
  @Post('chat') chat(@Body() _b: unknown) {
    return { reply: 'ok' };
  }
}

@Controller('deals')
class FakeDeals {
  @Get() list() {
    return [];
  }
}

@Module({ imports: [ThrottlerModule.forRoot([RATE_BURST, RATE_DAILY])], controllers: [FakeAssistant, FakeDeals] })
class TestModule {}

describe('rate limits', () => {
  it('limits the assistant to 10 messages a minute per visitor, without limiting catalog reads', async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0);
    const base = (await app.getUrl()).replace('[::1]', 'localhost');
    try {
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) codes.push((await fetch(`${base}/assistant/chat`, { method: 'POST' })).status);
      expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
      expect(codes[10]).toBe(429);
      const reads = await Promise.all(Array.from({ length: 70 }, () => fetch(`${base}/deals`).then((r) => r.status)));
      expect(reads.every((c) => c === 200)).toBe(true);
    } finally {
      await app.close();
    }
  });
});
