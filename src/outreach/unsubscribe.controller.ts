import { Controller, Get, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'node:crypto';
import { unsubscribeToken } from './mail-format';
import { OutreachService } from './outreach.service';

const page = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#f6f7f9;color:#141b2d}main{max-width:420px;margin:24px;padding:32px;background:#fff;border:1px solid #e3e7ee;border-radius:20px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#646d80}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

function valid(email?: string, token?: string) {
  if (!email || !token || email.length > 254) return false;
  const a = Buffer.from(unsubscribeToken(email));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Public opt-out link in every outreach email. POST is the one-click version mail apps use. */
@Controller('outreach/unsubscribe')
@UseGuards(ThrottlerGuard)
@Throttle({ burst: { limit: 20, ttl: 60_000 } })
export class UnsubscribeController {
  constructor(private readonly outreach: OutreachService) {}

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  async viaLink(@Query('e') e?: string, @Query('t') t?: string) {
    if (!valid(e, t)) return page('This link has expired', 'Reply to the email with "unsubscribe" and we will remove you.');
    await this.outreach.optOut(e!);
    return page("You're unsubscribed", "We won't email you about partnerships again.");
  }

  @Post()
  @HttpCode(200)
  async oneClick(@Query('e') e?: string, @Query('t') t?: string) {
    if (valid(e, t)) await this.outreach.optOut(e!);
    return { ok: true };
  }
}
