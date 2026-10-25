import type { LinkMethod, ProgramStatus } from '@prisma/client';

/**
 * Builds tracked outbound links. Vault never guesses a network's link format:
 *  - AMAZON_TAG adds the account's tracking ID as the documented "tag" parameter.
 *  - DEEPLINK_TEMPLATE uses the exact URL the network's dashboard gives you, with placeholders, and is only used if
 *    its host is one the owner listed as allowed.
 * A program that isn't APPROVED never produces a tracked link.
 */
export type ProgramConfig = {
  status: ProgramStatus;
  linkMethod: LinkMethod;
  accountTag: string | null;
  linkTemplate: string | null;
  allowedTrackingHosts: string[];
};

export type BuildResult = { ok: true; url: string; host: string } | { ok: false; reason: string };

const TAG = /^[a-z0-9][a-z0-9-]{2,39}$/i;
const PLACEHOLDER = /\{(\w+)\}/g;
const KNOWN_PLACEHOLDERS = new Set(['url', 'urlEncoded', 'clickId']);
export const CLICK_ID = /^[a-z0-9]{8,40}$/i;

const hostAllowed = (host: string, allowed: string[]) => {
  const h = host.toLowerCase();
  return allowed.some((a) => {
    const d = a.trim().toLowerCase();
    return d.length > 3 && (h === d || h.endsWith('.' + d));
  });
};

const parseHttps = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
};

function fill(template: string, destination: string, clickId: string) {
  return template.replace(PLACEHOLDER, (_all, name: string) =>
    name === 'url' ? destination : name === 'urlEncoded' ? encodeURIComponent(destination) : name === 'clickId' ? clickId : `{${name}}`,
  );
}

export function buildTrackedUrl(program: ProgramConfig, destination: string, clickId: string): BuildResult {
  if (program.status !== 'APPROVED') return { ok: false, reason: 'The program is not approved.' };
  if (!CLICK_ID.test(clickId)) return { ok: false, reason: 'Invalid click ID.' };
  const dest = parseHttps(destination);
  if (!dest) return { ok: false, reason: 'The store link is not https.' };

  if (program.linkMethod === 'AMAZON_TAG') {
    if (!program.accountTag || !TAG.test(program.accountTag)) return { ok: false, reason: 'The Amazon tracking ID is missing or invalid.' };
    dest.searchParams.set('tag', program.accountTag);
    return { ok: true, url: dest.toString(), host: dest.hostname };
  }

  if (program.linkMethod === 'DEEPLINK_TEMPLATE') {
    const template = program.linkTemplate?.trim();
    if (!template) return { ok: false, reason: 'No link template is saved.' };
    if (!program.allowedTrackingHosts.length) return { ok: false, reason: 'No allowed tracking hosts are saved.' };
    const url = fill(template, dest.toString(), clickId);
    if (/\{\w+\}/.test(url)) return { ok: false, reason: 'The template has an unknown placeholder.' };
    const built = parseHttps(url);
    if (!built) return { ok: false, reason: 'The built link is not a valid https URL.' };
    if (!hostAllowed(built.hostname, program.allowedTrackingHosts)) return { ok: false, reason: `Tracking host ${built.hostname} is not in the allowed list.` };
    return { ok: true, url: built.toString(), host: built.hostname };
  }

  return { ok: false, reason: 'No verified link method is configured.' };
}

/** Checks a program's link settings when they're saved, so a bad template is caught before any shopper clicks it. */
export function validateLinkConfig(cfg: Pick<ProgramConfig, 'linkMethod' | 'accountTag' | 'linkTemplate' | 'allowedTrackingHosts'>): string[] {
  const problems: string[] = [];
  if (cfg.linkMethod === 'AMAZON_TAG' && !(cfg.accountTag && TAG.test(cfg.accountTag))) {
    problems.push('Enter the Amazon tracking ID (letters, numbers and dashes, 3 to 40 characters).');
  }
  if (cfg.linkMethod === 'DEEPLINK_TEMPLATE') {
    const t = cfg.linkTemplate?.trim() ?? '';
    if (!t) problems.push('Paste the link template from the network.');
    else {
      const names = [...t.matchAll(PLACEHOLDER)].map((m) => m[1]);
      const unknown = names.filter((n) => !KNOWN_PLACEHOLDERS.has(n));
      if (unknown.length) problems.push(`Unknown placeholder {${unknown[0]}}. Use {url}, {urlEncoded} and {clickId}.`);
      if (!names.includes('url') && !names.includes('urlEncoded')) problems.push('The template needs {url} or {urlEncoded} where the product page goes.');
      if (!names.includes('clickId')) problems.push('The template needs {clickId} where the network expects your sub-ID, or commissions can\'t be matched to clicks.');
      if (!cfg.allowedTrackingHosts.length) problems.push('List the tracking host(s) the template points at.');
      else if (!problems.length) {
        const sample = buildTrackedUrl({ ...cfg, status: 'APPROVED' }, 'https://www.example-store.com/product/1?a=b', 'sampleclick01');
        if (!sample.ok) problems.push(sample.reason);
      }
    }
  }
  return problems;
}

/** Normalizes a pasted host list ("https://goto.example.com/, Click.example.net") to bare lowercase hosts. */
export function cleanHosts(input: string[]): string[] {
  return [...new Set(input.map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '')).filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)))];
}
