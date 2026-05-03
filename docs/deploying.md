# Deploying (Railway)

Production runs on **Railway** only. There is **no Vercel** config in this repo.

## What runs in production

- **Build:** `npm run build` (root) — installs client deps, builds `client/dist`, prepares the Node app.
- **Start:** `npm start` — `tsx server/server.ts` listens on `PORT` (Railway sets this).
- **Single process:** Express serves JSON under `/api/*` and the Vite-built SPA from `client/dist` for all non-API routes (`server/server.ts`).

Config-as-code: `railway.toml` (Nixpacks builder, health check `GET /api/health`, restart on failure).

## Required environment variables (Railway dashboard)

| Variable | Required | Notes |
|----------|------------|--------|
| `OPENAI_API_KEY` | Yes | Parser, chat, transcription paths. |
| `PORT` | No | Set automatically by Railway; local default `3001`. |

Optional client build-time (only if the browser must call a **different** host than the page):

- `VITE_API_URL` — API origin without trailing slash. **Leave unset** for same-origin (typical Railway: one service serves UI + API).

## How to ship changes

### A. GitHub → Railway (recommended)

If the Railway service is connected to GitHub with deploy-on-push:

1. Merge or push to the branch Railway watches (usually `main`).
2. `git push origin main` (or your deploy branch).

No local CLI required. Watch the deploy in the Railway dashboard.

### B. CLI from your machine

Useful for ad-hoc deploys without pushing, or when debugging the build on Railway’s builder.

1. Install the CLI once: `npm i -g @railway/cli`
2. Authenticate once: `railway login`
3. In the repo root, link the directory to the project once: `railway link`
4. Deploy current workspace: **`npm run deploy:railway`** (runs `railway up`)

`railway up` uploads the **current working tree** (including uncommitted changes if present). Prefer GitHub-triggered deploys for team workflows.

## Quick checklist for agents

1. **Code merged?** Push to the deploy branch; confirm Railway build succeeded.
2. **New server env var?** Add it in Railway **Variables** and redeploy.
3. **Client talks to wrong API?** Same service = leave `VITE_API_URL` empty at build time. Split services = set `VITE_API_URL` at build to the API public URL.
4. **Health check failing?** Ensure `GET /api/health` returns 200 (see `server/createApp.ts`).

## Local parity with production

```bash
npm run build
npm start
```

Open the printed URL; you should get the SPA and working `/api/chat` against the same origin.
