# Deploying to Railway

Railway has no perpetual free tier, but new accounts get trial credit
that comfortably covers a short-lived demo/review deployment of this
stack (small Postgres + small Redis + two lightweight Node services
idle most of the time). No subscription required for that.

This repo is already Railway-ready: `railway.json` tells Railway to
build with the existing `Dockerfile`, and `src/lib/redis.ts` accepts a
single `REDIS_URL` connection string (which is what Railway's Redis
plugin provides) in addition to the discrete host/port vars used for
local dev.

## 1. Push this repo to GitHub

Railway deploys from a GitHub repo you own.

```bash
cd taskflow-backend
git init
git add .
git commit -m "TaskFlow backend"
gh repo create taskflow-backend --private --source=. --push
# (or create the repo on github.com and `git remote add origin ...; git push`)
```

## 2. Create the Railway project

1. Go to **railway.app** → sign up/log in (GitHub OAuth is easiest).
2. **New Project → Deploy from GitHub repo** → select the repo you just pushed.
3. Railway detects the `Dockerfile` automatically and creates your first
   service (call it **api**). Don't let it deploy yet — add the
   databases first so the env vars below are available to reference.

## 3. Add Postgres and Redis

In the same project:
- **+ New → Database → Add PostgreSQL**
- **+ New → Database → Add Redis**

Railway provisions both and exposes `${{Postgres.DATABASE_URL}}` and
`${{Redis.REDIS_URL}}` as reference variables other services in the
project can use.

## 4. Configure the `api` service

Open the **api** service → **Variables** tab → add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `NODE_ENV` | `production` |
| `JWT_ACCESS_SECRET` | a long random string — generate with `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | a **different** long random string |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL_DAYS` | `7` |
| `BCRYPT_COST_FACTOR` | `12` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `60000` |
| `AUTH_RATE_LIMIT_MAX` | `10` |

Don't set `PORT` manually — Railway injects it automatically and the app
already reads `process.env.PORT`.

Deploy. The Dockerfile's default command runs migrations then starts the
server (`node dist/src/db/migrate.js && node dist/src/server.js`), so the
schema is created automatically on first boot.

Then: **Settings → Networking → Generate Domain** to get a public URL.
That's your `Live Deployment Link`.

## 5. Add the `worker` service (Task 04's BullMQ consumer)

1. **+ New → GitHub Repo** → same repo again, as a second service. Name
   it **worker**.
2. **Settings → Deploy → Custom Start Command** → `node dist/src/worker.js`
   (this overrides the Dockerfile's default CMD for this service only).
3. **Variables** → add the same `DATABASE_URL` and `REDIS_URL` references
   as the `api` service (the worker doesn't need the JWT/rate-limit vars).
4. No public domain needed for this one — it's a background consumer.

## 6. Seed sample data (optional)

From your machine, with the Railway CLI:

```bash
npm i -g @railway/cli
railway login
railway link              # select this project
railway run --service api node dist/src/db/seed.js
```

## 7. Verify

- Health check: `https://<your-domain>.up.railway.app/health`
- Swagger UI: `https://<your-domain>.up.railway.app/docs`
- Import `docs/TaskFlow.postman_collection.json` into Postman and change
  the collection's `baseUrl` variable from `http://localhost:3000` to
  your Railway domain — that's the one manual edit needed to point the
  collection at a deployed instance instead of localhost; every
  token/id chained between requests still auto-populates as before.

## Cost expectations

A small Postgres + small Redis + two low-traffic Node services sitting
mostly idle typically costs a small fraction of a dollar per day on
Railway's usage-based pricing — trial credit should cover a review
period of at least a couple of weeks. Delete the project (or pause the
services) once you no longer need it live.
