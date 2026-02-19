# Docker strategy: full app vs agentic tools

## Current setup

- **CollabBoard**: Next.js app (SSR + API routes). AI chat lives in `/api/chat` (OpenAI + Supabase).
- **Supabase**: Hosted (auth, DB, realtime). No need to run in Docker.
- **Full project is Dockerized** (Option A): one image runs the app; Supabase and env are external.

---

## Build and run

### Build the image

```bash
docker build -t collabboard .
```

### Run the container

Pass env at runtime (do not bake secrets into the image):

```bash
docker run -p 3000:3000 --env-file .env.local collabboard
```

Or use Compose:

```bash
docker compose up
```

App is at **http://localhost:3000**.

---

## Required environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `OPENAI_API_KEY` | If AI enabled | For `/api/chat` (e.g. `NEXT_PUBLIC_ENABLE_AI=true`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | For Share / invite-by-email |
| `NEXT_PUBLIC_ENABLE_AI` | Optional | Set to `true` to enable AI assistant |
| `NEXT_PUBLIC_SITE_URL` | Optional | App URL for auth redirects |

Use a `.env.local` (or `.env`) and pass it with `--env-file .env.local`. Never commit real env files.

---

## Option B: Agentic tools (later)

When you add a separate agent or tool-runner service:

- Run it in its own container; Next.js app calls it via HTTP (e.g. `AGENT_SERVICE_URL`).
- Add a second service to `docker-compose.yml` and wire the app to it.
- See the plan for the high-level layout (app container + agent container, both talking to Supabase).

No agent container is included in the current setup.
