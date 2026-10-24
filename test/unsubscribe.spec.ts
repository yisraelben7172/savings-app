import { unsubscribeToken } from '../src/outreach/mail-format';
import type { OutreachService } from '../src/outreach/outreach.service';
import { UnsubscribeController } from '../src/outreach/unsubscribe.controller';

describe('unsubscribe link', () => {
  beforeAll(() => (process.env.OUTREACH_SECRET = 'test-secret'));

  function setup() {
    const optOut = jest.fn(async () => undefined);
    return { ctl: new UnsubscribeController({ optOut } as unknown as OutreachService), optOut };
  }

  it('opts out with a valid signed link (link click and one-click POST)', async () => {
    const { ctl, optOut } = setup();
    const t = unsubscribeToken('a@b.test');
    expect(await ctl.viaLink('a@b.test', t)).toContain("You're unsubscribed");
    await ctl.oneClick('a@b.test', t);
    expect(optOut).toHaveBeenCalledTimes(2);
  });

  it('ignores forged or missing tokens', async () => {
    const { ctl, optOut } = setup();
    expect(await ctl.viaLink('a@b.test', 'forged')).toContain('expired');
    expect(await ctl.viaLink('a@b.test', unsubscribeToken('other@b.test'))).toContain('expired');
    expect(await ctl.viaLink(undefined, undefined)).toContain('expired');
    await ctl.oneClick('a@b.test', 'forged');
    expect(optOut).not.toHaveBeenCalled();
  });
});
