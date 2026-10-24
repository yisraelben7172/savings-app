import { createHmac } from 'node:crypto';

export const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);

export function buildRawEmail(m: {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  text: string;
  unsubscribeUrl: string;
  inReplyTo?: string | null;
}) {
  const headers = [
    `From: ${encodeHeader(m.fromName)} <${m.fromEmail}>`,
    `To: ${m.to}`,
    `Subject: ${encodeHeader(m.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    // Gmail/Yahoo bulk-sender rules: one-click unsubscribe (RFC 8058).
    `List-Unsubscribe: <${m.unsubscribeUrl}>, <mailto:${m.fromEmail}?subject=unsubscribe>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
  ];
  if (m.inReplyTo) headers.push(`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`);
  const body = Buffer.from(m.text).toString('base64').replace(/.{76}/g, '$&\r\n');
  return b64url(`${headers.join('\r\n')}\r\n\r\n${body}`);
}

/** Fills {{brand}} {{firstName}} {{category}} {{website}} from the partner. */
export function renderTemplate(text: string, p: { name: string; contactName?: string | null; category?: string | null; website?: string | null }) {
  const firstName = p.contactName?.trim().split(/\s+/)[0] || 'there';
  const vars: Record<string, string> = {
    brand: p.name,
    firstName,
    category: p.category?.toLowerCase() || 'shopping',
    website: p.website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || p.name,
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k: string) => vars[k] ?? all);
}

/** Every outreach email ends with who we are, a postal address and how to opt out (CAN-SPAM). */
export function withFooter(body: string, signature: string, postalAddress: string, unsubscribeUrl: string) {
  return `${body.trim()}\n\n${signature.trim()}\n\n--\nVault, ${postalAddress.trim()}\nIf you'd rather not hear from us again, reply "unsubscribe" or use this link: ${unsubscribeUrl}\n`;
}

const secret = () => process.env.OUTREACH_SECRET || process.env.ADMIN_API_KEY || 'dev-only-secret';

export function unsubscribeToken(email: string) {
  return createHmac('sha256', secret()).update(email.trim().toLowerCase()).digest('base64url').slice(0, 32);
}

export function unsubscribeUrl(email: string) {
  const base = (process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
  return `${base}/api/outreach/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

/** "Jane Doe <jane@x.com>" -> { name, email } */
export function parseAddress(v: string): { name: string | null; email: string } {
  const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: v.trim().toLowerCase() };
}

export const OPT_OUT = /\b(unsubscribe|remove me|stop (emailing|contacting)|do not (email|contact)|don'?t (email|contact))\b/i;
