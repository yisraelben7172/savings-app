import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Admin routes need the x-admin-key header to match ADMIN_API_KEY. Only the website's server knows it. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || expected.length < 24) throw new UnauthorizedException('Admin is not configured (set ADMIN_API_KEY, 24+ characters)');
    const got = ctx.switchToHttp().getRequest<Request>().header('x-admin-key') ?? '';
    if (!timingSafeEqual(digest(got), digest(expected))) throw new UnauthorizedException();
    return true;
  }
}
