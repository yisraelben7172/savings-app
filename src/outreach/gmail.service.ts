import { Injectable } from '@nestjs/common';

type Header = { name: string; value: string };
type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[]; headers?: Header[] };
export type GmailMessage = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: Part;
};

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * The outreach mailbox (a Google Workspace address on the outreach domain), via the Gmail API.
 * Needs GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN and GMAIL_SENDER (run `npm run gmail:connect` once).
 */
@Injectable()
export class GmailService {
  private token: { value: string; expires: number } | null = null;

  get configured() {
    return Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN && process.env.GMAIL_SENDER);
  }

  get sender() {
    return (process.env.GMAIL_SENDER ?? '').trim().toLowerCase();
  }

  private async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(`Gmail sign-in failed (${res.status}). Reconnect Gmail. ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return this.token.value;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json', ...init.headers },
    });
    if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json() as Promise<T>;
  }

  async send(raw: string, threadId?: string | null) {
    const sent = await this.call<{ id: string; threadId: string }>('/messages/send', {
      method: 'POST',
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
    // Gmail sets the real Message-ID; keep it so follow-ups thread correctly.
    const meta = await this.call<GmailMessage>(`/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
    return { ...sent, messageId: header(meta, 'Message-ID') };
  }

  async listInbox(query: string, max = 50) {
    const data = await this.call<{ messages?: { id: string; threadId: string }[] }>(
      `/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    );
    return data.messages ?? [];
  }

  get(id: string) {
    return this.call<GmailMessage>(`/messages/${id}?format=full`);
  }
}

export function header(m: GmailMessage, name: string) {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

/** The plain-text body (falls back to stripped HTML). */
export function textBody(m: GmailMessage): string {
  const find = (p: Part | undefined, type: string): string | null => {
    if (!p) return null;
    if (p.mimeType === type && p.body?.data) return Buffer.from(p.body.data, 'base64url').toString('utf8');
    for (const c of p.parts ?? []) {
      const hit = find(c, type);
      if (hit) return hit;
    }
    return null;
  };
  const plain = find(m.payload, 'text/plain');
  if (plain) return plain;
  const html = find(m.payload, 'text/html') ?? '';
  return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

/** Drops the quoted earlier conversation so the dashboard shows just the new reply. */
export function stripQuoted(text: string) {
  const cut = text.search(/\n(On .+wrote:|-{2,} ?Original Message|From: .+\nSent: )/i);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/(\n>.*)+\s*$/g, '').trim();
}
