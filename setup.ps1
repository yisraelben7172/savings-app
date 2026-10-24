# Sales App - one-time setup (run in PowerShell from this folder)
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup.ps1
$ErrorActionPreference = "Stop"

Write-Host "Checking tools..." -ForegroundColor Cyan
node -v; npm -v

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example - edit DATABASE_URL if your Postgres password differs." -ForegroundColor Yellow
}

Write-Host "Installing npm packages (NestJS, Prisma, etc.)..." -ForegroundColor Cyan
npm install

Write-Host "Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate

Write-Host "Creating database tables (first migration)..." -ForegroundColor Cyan
npx prisma migrate dev --name init

Write-Host "Seeding demo data..." -ForegroundColor Cyan
npx prisma db seed

Write-Host "Done! Start the API with:  npm run start:dev" -ForegroundColor Green
