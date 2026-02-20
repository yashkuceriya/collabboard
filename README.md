# CollabBoard

Real-time collaborative whiteboard. Built with Next.js and Supabase.  
**MVP** = 9 items (see [MVP-CHECKLIST.md](./MVP-CHECKLIST.md)); **AI board agent** = full app (optional, enable with `NEXT_PUBLIC_ENABLE_AI=true`).

**MVP scope:** Infinite board (pan/zoom) · Sticky notes (editable text) · Shapes (rectangle, circle) · Create/move/edit objects · **Delete:** select any object then press Delete key or use the Delete button · Real-time sync · Multiplayer cursors with labels · Presence (who’s online) · Auth · Deployed & publicly accessible.

**Beyond MVP:** Interview boards · Board chat · Freehand pen/eraser · Frames (toolbar **F** + AI; move frame moves children) · Rotation · AI (interview/creative mode, fun facts) · Recent boards (history tab). See [MVP-CHECKLIST.md](./MVP-CHECKLIST.md). **Submission:** [SUBMISSION-CHECKLIST.md](./SUBMISSION-CHECKLIST.md) and [REQUIREMENTS-SATISFACTION.md](./REQUIREMENTS-SATISFACTION.md).

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
- **LangSmith (optional)** — for AI cost/usage tracing in [LangSmith](https://smith.langchain.com), set in Vercel (either `LANGSMITH_*` or `LANGCHAIN_*`; both work):
  - `LANGSMITH_API_KEY` or `LANGCHAIN_API_KEY` — your LangSmith API key
  - `LANGSMITH_TRACING=true` or `LANGCHAIN_TRACING=true` (use lowercase `true`; the SDK checks for the string `"true"`)
  - `LANGSMITH_ENDPOINT=https://api.smith.langchain.com` (or leave unset; app sets it when key is present)
  - `LANGSMITH_PROJECT=CollabBoard` or `LANGCHAIN_PROJECT=CollabBoard` — project name in the dashboard (get from Supabase Settings → API → service_role; never expose in client)

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

## Architecture & Real-Time Sync

### Conflict Handling

CollabBoard uses **last-write-wins (LWW)** for simultaneous edits. Each element is a row in the `board_elements` Postgres table. When two users move the same element at the same time, the last `UPDATE` to reach Supabase wins. This is acceptable for a collaborative whiteboard where conflicts are rare and visually recoverable (the user can simply move the element again).

### Real-Time Sync

- **Object sync:** Supabase Realtime `postgres_changes` on the `board_elements` table. When any user creates, updates, or deletes an element, all other users receive the change within ~50–100ms. A broadcast fallback sends new/deleted elements via Supabase broadcast channel for faster propagation.
- **Cursor sync:** Each user's cursor position is broadcast via Supabase Realtime `broadcast` (~30fps). Other clients receive and render cursors with name labels on the canvas.
- **Presence:** Supabase Realtime `presence` tracks who is online on each board. The PresenceBar shows avatars and "N online."

### Disconnect & Reconnect

Supabase Realtime handles reconnection automatically. When a user loses connection:
1. The Supabase client detects the drop and retries.
2. On reconnect, the client re-subscribes to `postgres_changes`, `broadcast`, and `presence`.
3. State is re-fetched from Postgres, so the user sees the latest board state.
4. Any edits made while disconnected are lost (no offline queue); the user can redo them.

### Persistence

All board state is in Postgres. When all users leave and return later, the board is loaded fresh from the database. No data is lost.

### Performance

- **Viewport culling:** Only elements within the visible viewport are drawn, supporting 500+ elements.
- **60 FPS target:** Canvas uses `requestAnimationFrame` and only redraws when state changes.
- **Optimistic updates:** Element creation and movement are applied locally before the server roundtrip, then reconciled when the real ID arrives.
