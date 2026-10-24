import type { NextFunction, Request, Response } from 'express';

/** Allows exact origins plus simple wildcards like https://*.vercel.app */
export function corsOrigin(list: string) {
  const rules = list.split(',').map((s) => s.trim()).filter(Boolean);
  return (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
    if (!origin) return cb(null, true);
    const ok = rules.some((r) =>
      r.includes('*') ? new RegExp('^' + r.replace(/[.]/g, '\\.').replace('*', '[a-z0-9-]+') + '$', 'i').test(origin) : r === origin,
    );
    cb(null, ok);
  };
}

/** Basic hardening headers for an API that only returns JSON and a few tiny HTML pages. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.removeHeader('X-Powered-By');
  next();
}
