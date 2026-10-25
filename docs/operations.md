# Operations

## Run locally (Windows)
1. PostgreSQL 17 runs as a Windows service (user `sales`, database `sales_app`).
2. API: double-click `start-api.bat` (frees port 3000 first), or `npm run start:dev`. Health check: http://localhost:3000/api/health
3. Website: `cd web` then `npm run dev` → http://localhost:3001. Admin: http://localhost:3001/admin (password in `web/.env.local`).

## Environment variables

API (`.env` locally, Render online). Names only; see `.env.example`.

| Name | Needed for |
|---|---|
| `DATABASE_URL` | Database (Render sets it from `vault-db`) |
| `PORT` | Local only (Render sets it) |
| `CORS_ORIGIN` | Which websites may call the API from browsers |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | AI assistant (falls back to keyword search without a key) |
| `AMAZON_ASSOCIATE_TAG` | Amazon links, once approved |
| `ADMIN_API_KEY` | Admin API. Same value in the website's environment |
| `OUTREACH_SECRET` | Signs unsubscribe links |
| `WEB_URL` | Links in Telegram alerts |
| `PUBLIC_API_URL` | Public API address for unsubscribe links (Render provides `RENDER_EXTERNAL_URL` automatically) |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | Outreach mailbox |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Phone alerts |
| `SEED_DEMO_DATA` | Render only: `true` loads demo deals on start. `false` stops re-loading them but does not delete demo deals already in the database; the site keeps its "samples" bar until they're removed (cleanup script planned with the first real data source). |

Website (`web/.env.local` locally, Vercel online): `NEXT_PUBLIC_API_URL`, `ADMIN_API_KEY`, `ADMIN_PASSWORD`.

## Checks before pushing
- API: `npm test` (Jest unit tests), `npm run test:int` (integration tests on a real database; they use a separate `vault_test` schema in the local Postgres and never touch `public`), `npm run lint` (type check), `npm run build`.
- Website: `cd web`, `npx eslint src`, `npx next build`. Stop `npm run dev` first or the build and the dev server fight over `web/.next`; if the dev server serves stale styles, stop it and delete `web/.next`.

## Deploy
- Push to `main` on GitHub. Render redeploys the API (`render.yaml`), Vercel redeploys the website (Root Directory `web`).
- New environment variables: add them in the Render and Vercel dashboards (blueprint `sync: false` values aren't filled in automatically for existing services), then redeploy.
- Production deploys and production config changes need the owner's go-ahead.

## Database migrations
- Create locally: `npx prisma migrate dev --name <change>`. Commit the new folder in `prisma/migrations/`.
- Applied in production automatically on API start (`prisma migrate deploy` in `render.yaml`).
- Migrations are additive (new tables and columns). Rollback: deploy the previous commit; the extra tables are ignored by older code. To actually remove a migration's changes, run its file in `prisma/rollbacks/` (e.g. `npx prisma db execute --file prisma/rollbacks/20261025120000_catalog_sources.down.sql --schema prisma/schema.prisma`) and delete its row from `_prisma_migrations`. That deletes the data in those tables, so it needs the owner's go-ahead. Never edit an applied migration, and never run `prisma migrate reset` against production.
- If `prisma migrate dev` refuses to run ("non-interactive"), generate the SQL with `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`, save it as a new migration folder, review it, then `npx prisma migrate deploy`.

## Importing a product feed
Admin → Data sources → the source → Import a feed file. Required columns: SKU, title, price (or sale_price), link, category. Results show counts and every rejected row with its line number. Feeds are re-uploaded by hand today (scheduled pulls are planned). See `docs/affiliate-integrations.md` for onboarding a partner.
- Backups: Render's paid Postgres plans include daily backups. The free plan has none and expires after 30 days; upgrade before real data matters.

## Background jobs (API, `src/outreach/outreach.scheduler.ts`)

| Job | Schedule | What it does |
|---|---|---|
| Send next | every 5 min | Sends at most one approved email if allowed (not paused, Gmail connected, postal address set, weekday business hours Eastern, under the 24-hour limit, spacing respected). |
| Inbox check | every 3 min | Pulls new mail from the last 7 days, links replies, detects opt-outs and bounces, stops follow-ups, sends Telegram alerts, pauses on high bounce rate. |
| Morning prep | weekdays 8:00 Eastern | Drafts due follow-ups and first emails (up to the daily limit), then sends a Telegram summary. |

Jobs are idempotent: an email is marked SENT only after Gmail accepts it; inbound mail is keyed by Gmail message ID (unique), so re-checking never duplicates. Overlapping runs are prevented within a process. **Render's free plan sleeps after 15 minutes idle, which pauses all jobs.** Use the paid "starter" plan before relying on outreach.

## Outreach setup (owner)
1. Buy a separate outreach domain; set up Google Workspace with one mailbox.
2. Add SPF, DKIM and DMARC DNS records (Cloudflare).
3. Google Cloud: create an OAuth client (Desktop app) with the Gmail API enabled; put the client ID and secret in `.env`; run `npm run gmail:connect`, sign in with the outreach mailbox, copy the printed refresh token. Put all four Gmail values in Render.
4. Telegram: message @BotFather to create a bot; send your bot a message; get your chat ID; put both values in Render. Test from Admin → Settings.
5. Admin → Settings: add your postal address and signature. Warm up the mailbox for 2–4 weeks at a low daily limit.

## Runbooks
- **Stop all outreach now**: Admin → Settings → Pause sending.
- **Bounce spike**: sending pauses itself and alerts you. Remove bad addresses, then Resume.
- **Someone asks to stop**: they're added to the do-not-email list automatically (reply "unsubscribe" or the link). To add manually, set the partner to "Opted out".
- **"Port 3000 in use" locally**: run `start-api.bat`; it stops the old copy.
- **Admin sign-in fails online**: check `ADMIN_PASSWORD` and `ADMIN_API_KEY` in Vercel, and that `ADMIN_API_KEY` matches Render.
