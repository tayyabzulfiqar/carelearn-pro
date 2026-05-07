# API Source Recovery and VPS Integration

## Source discovery result
Production API source was found in a separate monorepo:
- `C:\Users\HP\carelearn-pro\apps\api`

Evidence it is the live CareLearn API:
- Route set includes `/api/v1/courses`, `/api/v1/enrollments`, `/api/v1/certificates`, `/api/v1/auth`
- Fire Safety course assets and quiz content exist under `apps/api/src/content/fire-safety`
- Runtime logs show production flows (login, lesson progress, quiz attempt, certificate issue)

## What was missing and fixed
The API was Vercel-style serverless (`vercel.json` -> `src/index.js`) and did not bind a VPS port.

Added VPS-native startup:
- `apps/api/src/server.js`
- `apps/api/package.json` scripts now run `src/server.js` for `start` and `dev`

## Production containerization added
- `docker/api/Dockerfile`
- `docker/web/Dockerfile`
- `docker-compose.production.yml`
- `docker/nginx/conf.d/carelearn.conf.template`
- `docker/nginx/includes/security-headers.conf`
- `docker/nginx/entrypoint.sh`
- `.env.production.example`
- `scripts/deploy-prod.sh`
- `scripts/update-prod.sh`
- `scripts/backup-postgres.sh`
- `scripts/restore-postgres.sh`
- `scripts/health-check.sh`

## VPS execution
1. `cp .env.production.example .env.production`
2. Fill real values in `.env.production`
3. `bash scripts/deploy-prod.sh`
4. `bash scripts/health-check.sh`

## Key envs
- `DATABASE_URL=postgresql://carelearn_admin:<password>@postgres:5432/carelearn_production?sslmode=disable`
- `NEXT_PUBLIC_API_URL=https://<your-domain>/api/v1`
- `CORS_ORIGIN=https://<your-domain>`
- `JWT_SECRET=<strong secret>`

## Notes
- Existing production PostgreSQL data is preserved via named volume (`postgres_data`).
- API uploads are persisted via named volume (`api_uploads`).
- TLS issuance and renew are included via certbot service.