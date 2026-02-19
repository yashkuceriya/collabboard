# CollabBoard

Real-time collaborative whiteboard. Built with Next.js and Supabase.  
**MVP** = 9 items (see [MVP-CHECKLIST.md](./MVP-CHECKLIST.md)); **AI board agent** = full app (optional, enable with `NEXT_PUBLIC_ENABLE_AI=true`).

**MVP scope:** Infinite board (pan/zoom) · Sticky notes (editable text) · Shapes (rectangle, circle) · Create/move/edit objects · **Delete:** select any object then press Delete key or use the Delete button · Real-time sync · Multiplayer cursors with labels · Presence (who’s online) · Auth · Deployed & publicly accessible.

**Beyond MVP:** Interview boards · Board chat · Freehand pen/eraser · Rotation · AI (interview/creative mode, fun facts) · Recent boards (history tab). See [MVP-CHECKLIST.md](./MVP-CHECKLIST.md).

## Quick Start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd collabboard
pnpm install
```

### 2. Supabase setup

1. **Create project:** [supabase.com](https://supabase.com) → New Project → choose org, name, password, region.
2. **Run schema:** Dashboard → SQL Editor → New Query → paste contents of `supabase/schema.sql` → Run.  
   This creates `boards`, `board_elements`, RLS (including **shared board access**: any authenticated user can read any board for collaboration), realtime on `board_elements`, and `updated_at` trigger.  
   **If you already ran an older schema:** run `supabase/migrations/20250216_shared_board_access.sql` in SQL Editor so multiple users can open the same board and sync.  
   **Board sharing (optional):** Run `supabase/migrations/20250218000000_board_members_and_sharing.sql` in SQL Editor. This adds a `board_members` table and RLS so boards are visible only to the owner and people they share with. You can then use the **Share** button on a board (owner only) to invite by email (Editor or Viewer). For invite-by-email to work, set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Settings → API → service_role key; keep it server-side only).
3. **Enable Auth:** Authentication → Providers → **Email** → Enable.  
   **Email confirmation (e.g. on Vercel):** Dashboard → **Authentication** → **URL Configuration**. Set **Site URL** to your app URL (e.g. `https://your-app.vercel.app`). Add **Redirect URLs**: `https://your-app.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` for local dev). Then the sign-up confirmation email will send users to your app after they confirm.
4. **Enable Realtime (required for presence + cursors):**  
   Dashboard → **Project Settings** (gear) → **Realtime**. Ensure **Realtime** is enabled.  
   If your project uses "Only allow private channels", leave it; the app calls `setAuth()` so the session is sent.  
   If presence/cursors still don’t work, try **Allow public access** temporarily to confirm it’s not an auth restriction.
5. **Get keys:** Settings → API → copy **Project URL** and **anon public** key.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` — Project URL from Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon key from Supabase
- `NEXT_PUBLIC_SITE_URL` — optional; your app URL in production (e.g. `https://your-app.vercel.app`) so sign-up confirmation emails redirect to your deployment. Vercel sets `NEXT_PUBLIC_VERCEL_URL` automatically.
- `NEXT_PUBLIC_ENABLE_AI=true` — optional; enables AI board agent (full app)
- `OPENAI_API_KEY` — only if AI is enabled
- `SUPABASE_SERVICE_ROLE_KEY` — optional; required for **Share → Invite by email**
- `LANGCHAIN_API_KEY` — optional; when set, AI chat is traced in [LangSmith](https://smith.langchain.com) (OpenAI cost/usage). In Vercel also add `LANGCHAIN_TRACING=true` and `LANGCHAIN_PROJECT=collabboard` so traces appear under that project. The app sets the LangSmith API endpoint automatically when the key is present. (get from Supabase Settings → API → service_role; never expose in client)

### 4. Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

To run with Docker instead (build image and run with your env), see [DOCKER-STRATEGY.md](./DOCKER-STRATEGY.md).

### 5. Test multiplayer

Open two browser windows (or one normal + one incognito) with **two different accounts** at the **same board URL**. You should see:
- **Real-time cursors:** Each user’s cursor and name label on the board. Cursor position is sent via Supabase Realtime **broadcast** (~30fps); “who’s online” comes from **presence**.
- Sticky notes and shapes appearing in real-time
- Edits synced instantly

**How cursor tracking works:** On mouse move, the canvas calls `broadcastCursor(x, y)` (world coordinates). The presence hook sends a `broadcast` message on the board channel; other clients receive it and update a cursor map, which is merged with the presence list so each peer’s cursor is drawn on the canvas.

## Deploy to Vercel

1. Push to GitHub
2. Import in [vercel.com](https://vercel.com) → New Project
3. Add environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required). Optionally `NEXT_PUBLIC_SITE_URL` (your production URL) for email confirmation redirects.
4. Deploy

**MVP submission:** Ensure the live URL is accessible, sign-up/sign-in work, and Supabase Auth URL Configuration includes your Vercel URL and `https://your-app.vercel.app/auth/callback` in Redirect URLs.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (React) + TypeScript |
| Backend | Next.js API Routes |
| Database | Supabase (PostgreSQL) |
| Real-time | Supabase Realtime (Postgres changes + Presence) — **no Liveblocks** |
| Auth | Supabase Auth |
| AI (full app) | OpenAI GPT-4o-mini + Vercel AI SDK (optional) |
| Hosting | Vercel |

**Constraint:** This project does not use Liveblocks. All real-time collaboration (cursor sync, presence, object sync) is implemented with Supabase Realtime only.
