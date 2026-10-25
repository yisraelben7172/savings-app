import { buildTrackedUrl, cleanHosts, validateLinkConfig, type ProgramConfig } from '../src/affiliate/link-builder';

const base: ProgramConfig = { status: 'APPROVED', linkMethod: 'NONE', accountTag: null, linkTemplate: null, allowedTrackingHosts: [] };
const DEST = 'https://www.example-store.com/p/1?color=red';
const CLICK = 'abc123def456abc123def456';
const tpl = (over: Partial<ProgramConfig> = {}): ProgramConfig => ({
  ...base, linkMethod: 'DEEPLINK_TEMPLATE', linkTemplate: 'https://track.network.test/c?u={urlEncoded}&sid={clickId}', allowedTrackingHosts: ['network.test'], ...over,
});

describe('buildTrackedUrl', () => {
  it('never builds a tracked link for a program that is not approved', () => {
    for (const status of ['NOT_APPLIED', 'APPLIED', 'REJECTED', 'PAUSED'] as const) {
      expect(buildTrackedUrl(tpl({ status }), DEST, CLICK)).toMatchObject({ ok: false });
      expect(buildTrackedUrl({ ...base, status, linkMethod: 'AMAZON_TAG', accountTag: 'vault-20' }, DEST, CLICK)).toMatchObject({ ok: false });
    }
  });

  it('has no link method until one is configured', () => {
    expect(buildTrackedUrl(base, DEST, CLICK)).toEqual({ ok: false, reason: 'No verified link method is configured.' });
  });

  it('adds the Amazon tracking ID as "tag", replacing any existing tag, keeping other parameters', () => {
    const r = buildTrackedUrl({ ...base, linkMethod: 'AMAZON_TAG', accountTag: 'vault-20' }, 'https://www.amazon.com/dp/B1?tag=someone-else&th=1', CLICK);
    expect(r).toEqual({ ok: true, url: 'https://www.amazon.com/dp/B1?tag=vault-20&th=1', host: 'www.amazon.com' });
  });

  it('rejects a missing or malformed Amazon tracking ID', () => {
    for (const accountTag of [null, '', 'a', 'bad tag!', 'x&y=1']) {
      expect(buildTrackedUrl({ ...base, linkMethod: 'AMAZON_TAG', accountTag }, DEST, CLICK)).toMatchObject({ ok: false });
    }
  });

  it('fills a network template with the encoded destination and the click ID', () => {
    const r = buildTrackedUrl(tpl(), DEST, CLICK);
    expect(r).toEqual({ ok: true, url: `https://track.network.test/c?u=${encodeURIComponent(DEST)}&sid=${CLICK}`, host: 'track.network.test' });
  });

  it('supports the raw {url} placeholder', () => {
    const r = buildTrackedUrl(tpl({ linkTemplate: 'https://track.network.test/deeplink/{clickId}/{url}' }), 'https://www.example-store.com/p/1', CLICK);
    expect(r).toMatchObject({ ok: true, url: `https://track.network.test/deeplink/${CLICK}/https://www.example-store.com/p/1` });
  });

  it('refuses templates that would send shoppers to a host that is not on the allowed list', () => {
    expect(buildTrackedUrl(tpl({ linkTemplate: 'https://evil.test/c?u={urlEncoded}&sid={clickId}' }), DEST, CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl({ linkTemplate: 'https://network.test.evil.test/c?u={urlEncoded}' }), DEST, CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl({ linkTemplate: '{url}' }), DEST, CLICK)).toMatchObject({ ok: false }); // would redirect to the store itself
    expect(buildTrackedUrl(tpl({ allowedTrackingHosts: [] }), DEST, CLICK)).toMatchObject({ ok: false });
  });

  it('refuses non-https results, unknown placeholders and unsafe inputs', () => {
    expect(buildTrackedUrl(tpl({ linkTemplate: 'http://track.network.test/c?u={urlEncoded}' }), DEST, CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl({ linkTemplate: 'https://track.network.test/c?u={urlEncoded}&x={secret}' }), DEST, CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl(), 'http://www.example-store.com/p/1', CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl(), 'javascript:alert(1)', CLICK)).toMatchObject({ ok: false });
    expect(buildTrackedUrl(tpl(), DEST, 'bad id\r\nSet-Cookie: x')).toMatchObject({ ok: false });
  });
});

describe('validateLinkConfig (checked when a program is saved)', () => {
  it('accepts a complete template and an Amazon tag', () => {
    expect(validateLinkConfig(tpl())).toEqual([]);
    expect(validateLinkConfig({ ...base, linkMethod: 'AMAZON_TAG', accountTag: 'vault-20' })).toEqual([]);
    expect(validateLinkConfig(base)).toEqual([]);
  });

  it('explains what is missing', () => {
    expect(validateLinkConfig({ ...base, linkMethod: 'AMAZON_TAG' }).join(' ')).toMatch(/tracking ID/);
    expect(validateLinkConfig({ ...base, linkMethod: 'DEEPLINK_TEMPLATE' }).join(' ')).toMatch(/Paste the link template/);
    expect(validateLinkConfig(tpl({ linkTemplate: 'https://track.network.test/c?sid={clickId}' })).join(' ')).toMatch(/\{url\}/);
    expect(validateLinkConfig(tpl({ linkTemplate: 'https://track.network.test/c?u={url}' })).join(' ')).toMatch(/\{clickId\}/);
    expect(validateLinkConfig(tpl({ linkTemplate: 'https://track.network.test/c?u={url}&s={clickId}&z={nope}' })).join(' ')).toMatch(/Unknown placeholder \{nope\}/);
    expect(validateLinkConfig(tpl({ allowedTrackingHosts: [] })).join(' ')).toMatch(/tracking host/);
  });

  it('catches a template whose host is not allowed, before any shopper clicks it', () => {
    expect(validateLinkConfig(tpl({ linkTemplate: 'https://other.test/c?u={urlEncoded}&s={clickId}' })).join(' ')).toMatch(/not in the allowed list/);
  });
});

describe('cleanHosts', () => {
  it('reduces pasted URLs to unique bare hosts and drops junk', () => {
    expect(cleanHosts([' https://Goto.Network.test/path ', 'goto.network.test', 'not a host', 'x', 'a.test:8080/x'])).toEqual(['goto.network.test', 'a.test']);
  });
});
