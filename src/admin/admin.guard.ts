import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** True when `got` matches ADMIN_API_KEY (constant-time). False if the key isn't configured or is too short. */
export function isAdminKey(got: string | undefined): boolean {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected || expected.length < 24) return false;
  return timingSafeEqual(digest(got ?? ''), digest(expected));
}

/** Admin routes need the x-admin-key header to match ADMIN_API_KEY. Only the website's server knows it. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || expected.length < 24) throw new UnauthorizedException('Admin is not configured (set ADMIN_API_KEY, 24+ characters)');
    if (!isAdminKey(ctx.switchToHttp().getRequest<Request>().header('x-admin-key'))) throw new UnauthorizedException();
    return true;
  }
}

/** Express middleware: rejects before a large upload body is even read. */
export function requireAdminKeyEarly(req: Request, res: Response, next: NextFunction) {
  if (!isAdminKey(req.header('x-admin-key'))) {
    res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
    return;
  }
  next();
}
