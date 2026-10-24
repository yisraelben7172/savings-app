import { buildRawEmail, OPT_OUT, parseAddress, renderTemplate, unsubscribeToken, unsubscribeUrl, withFooter } from '../src/outreach/mail-format';

const decode = (raw: string) => {
  const text = Buffer.from(raw, 'base64url').toString();
  const [head, body] = text.split('\r\n\r\n');
  return { head, body: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString() };
};

describe('outreach email format', () => {
  beforeAll(() => {
    process.env.OUTREACH_SECRET = 'test-secret';
    process.env.PUBLIC_API_URL = 'https://api.example.test/';
  });

  it('fills merge fields and leaves unknown ones visible', () => {
    expect(renderTemplate('Hi {{firstName}} at {{ brand }} ({{website}}), {{category}} {{nope}}', { name: 'Glow', contactName: 'Sam Lee', category: 'Beauty', website: 'https://glow.com/' }))
      .toBe('Hi Sam at Glow (glow.com), beauty {{nope}}');
    expect(renderTemplate('Hi {{firstName}}', { name: 'Glow' })).toBe('Hi there');
  });

  it('adds the postal address and opt-out link to every email (CAN-SPAM)', () => {
    const url = unsubscribeUrl('a@b.test');
    const text = withFooter('Body', 'Best,\nMe', 'PO Box 1, New York, NY', url);
    expect(text).toContain('PO Box 1, New York, NY');
    expect(text).toContain(url);
    expect(text).toMatch(/unsubscribe/i);
  });

  it('builds a plain-text email with one-click unsubscribe headers', () => {
    const url = unsubscribeUrl('a@b.test');
    const { head, body } = decode(buildRawEmail({ fromName: 'Vault', fromEmail: 'hi@out.test', to: 'a@b.test', subject: 'Café', text: 'Hello', unsubscribeUrl: url }));
    expect(head).toContain('From: Vault <hi@out.test>');
    expect(head).toContain('Subject: =?UTF-8?B?');
    expect(head).toContain(`List-Unsubscribe: <${url}>, <mailto:hi@out.test?subject=unsubscribe>`);
    expect(head).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
    expect(head).not.toContain('In-Reply-To');
    expect(body).toBe('Hello');
  });

  it('threads follow-ups with In-Reply-To', () => {
    const { head } = decode(buildRawEmail({ fromName: 'V', fromEmail: 'h@o.test', to: 'a@b.test', subject: 'Re: x', text: 'y', unsubscribeUrl: 'u', inReplyTo: '<id@mail>' }));
    expect(head).toContain('In-Reply-To: <id@mail>');
    expect(head).toContain('References: <id@mail>');
  });

  it('signs unsubscribe links per address, ignoring case', () => {
    expect(unsubscribeToken('A@B.test')).toBe(unsubscribeToken('a@b.test'));
    expect(unsubscribeToken('a@b.test')).not.toBe(unsubscribeToken('c@b.test'));
    expect(unsubscribeUrl('a@b.test')).toBe(`https://api.example.test/api/outreach/unsubscribe?e=a%40b.test&t=${unsubscribeToken('a@b.test')}`);
  });

  it('parses From headers', () => {
    expect(parseAddress('"Jane Doe" <Jane@X.com>')).toEqual({ name: 'Jane Doe', email: 'jane@x.com' });
    expect(parseAddress('jane@x.com')).toEqual({ name: null, email: 'jane@x.com' });
  });

  it('recognizes opt-out requests but not ordinary replies', () => {
    for (const t of ['Please unsubscribe me', 'remove me from your list', "Don't email me again", 'Stop emailing us']) expect(OPT_OUT.test(t)).toBe(true);
    for (const t of ['Sounds good, let us talk', 'Can you send your media kit?', 'We are not interested right now']) expect(OPT_OUT.test(t)).toBe(false);
  });
});
