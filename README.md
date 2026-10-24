# Sales App — Backend (NestJS + Prisma + PostgreSQL)

Starter backend for the sales app. The data model (users, customers, products, orders)
is a first draft and will be updated to match the Base44 app.

---

## 1. Install the tools (Windows — run in PowerShell or CMD as Administrator)

`winget` is built into Windows 10/11.

```powershell
# Node.js (LTS) - includes npm and npx
winget install --id OpenJS.NodeJS.LTS -e

# Git (recommended)
winget install --id Git.Git -e

# PostgreSQL 17 (the installer asks you to choose a password for the "postgres" user - remember it)
winget install --id PostgreSQL.PostgreSQL.17 -e
```

Close and reopen the terminal, then check:

```powershell
node -v
npm -v
psql --version
```

If `psql` isn't found, add it to PATH (adjust version number if different):

```powershell
setx PATH "$env:PATH;C:\Program Files\PostgreSQL\17\bin"
```

### Create the database and user

```powershell
psql -U postgres
```

Then inside psql:

```sql
CREATE USER sales WITH PASSWORD 'sales_password';
CREATE DATABASE sales_app OWNER sales;
ALTER USER sales CREATEDB;   -- needed by Prisma for migrations (shadow DB)
\q
```

**Alternative — Postgres via Docker** (instead of installing it):

```powershell
winget install --id Docker.DockerDesktop -e
# after Docker Desktop is running:
docker compose up -d
```

### Prisma

Prisma is installed per project (no global install needed). It's already listed
in `package.json`, so `npm install` gets it. If you ever start a new project:

```powershell
npm install prisma --save-dev
npm install @prisma/client
npx prisma init --datasource-provider postgresql
```

NestJS CLI (optional, useful for generating new modules):

```powershell
npm install -g @nestjs/cli
```

---

## 2. Set up this project

```powershell
cd $HOME\Documents\sales-app
copy .env.example .env        # then edit DATABASE_URL if needed
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev
```

Or run everything at once: `powershell -ExecutionPolicy Bypass -File .\setup.ps1`

Open http://localhost:3000/api/health — you should see `{"status":"ok","db":"up"}`.

Browse/edit data visually: `npx prisma studio`

---

## 3. API endpoints (all under `/api`)

| Method | Path | Description |
|---|---|---|
| GET | /health | API + DB check |
| GET/POST | /customers | List (`?search=`) / create |
| GET/PATCH/DELETE | /customers/:id | Read / update / delete |
| GET/POST | /products | List / create |
| GET/PATCH/DELETE | /products/:id | Read / update / deactivate |
| GET/POST | /orders | List / create (totals computed server-side) |
| GET | /orders/:id | Order with items |
| PATCH | /orders/:id/status | Change status |

Example order body:

```json
{ "customerId": "<id>", "items": [{ "productId": "<id>", "quantity": 2 }] }
```

---

## 4. Project structure

```
prisma/schema.prisma     database models
prisma/seed.ts           demo data
src/main.ts              app entry (CORS, validation, /api prefix)
src/prisma/              PrismaService (DB connection)
src/customers|products|orders/   feature modules
docker-compose.yml       optional local Postgres
```

## 5. Deploying

Production start: `npm run build` → `npx prisma migrate deploy` → `npm run start:prod`.
Set `DATABASE_URL`, `PORT`, `CORS_ORIGIN` as environment variables on the host.

## Next steps (TODO)

- Match models to the Base44 app's entities
- Authentication (JWT) and role permissions
- Connect the frontend
