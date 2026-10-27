// Default per-IP limits (in-memory, per API instance). Routes can tighten them with @Throttle.
export const RATE_BURST = { name: 'burst', ttl: 60_000, limit: 60 };
export const RATE_DAILY = { name: 'daily', ttl: 86_400_000, limit: 3000 };

/** Creating a plan runs up to 8 searches: 6 a minute and 40 a day per visitor. */
export const PLAN_LIMITS = { burst: { limit: 6, ttl: 60_000 }, daily: { limit: 40, ttl: 86_400_000 } };

/** The assistant costs money per message: 10 a minute and 100 a day per visitor. */
export const ASSISTANT_LIMITS = { burst: { limit: 10, ttl: 60_000 }, daily: { limit: 100, ttl: 86_400_000 } };
