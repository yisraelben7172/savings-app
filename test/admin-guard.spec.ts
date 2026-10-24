import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from '../src/admin/admin.guard';

const ctx = (key?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ header: (n: string) => (n === 'x-admin-key' ? key : undefined) }) }) }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const guard = new AdminGuard();
  const KEY = 'k'.repeat(32);

  afterEach(() => delete process.env.ADMIN_API_KEY);

  it('refuses everything when no admin key is configured', () => {
    expect(() => guard.canActivate(ctx(''))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(UnauthorizedException);
  });

  it('refuses a key that is too short to be safe', () => {
    process.env.ADMIN_API_KEY = 'short';
    expect(() => guard.canActivate(ctx('short'))).toThrow(UnauthorizedException);
  });

  it('refuses missing or wrong keys and accepts the right one', () => {
    process.env.ADMIN_API_KEY = KEY;
    expect(() => guard.canActivate(ctx(undefined))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx(KEY.slice(1)))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctx(KEY + 'x'))).toThrow(UnauthorizedException);
    expect(guard.canActivate(ctx(KEY))).toBe(true);
  });
});
