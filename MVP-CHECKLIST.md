# MVP Hard Gate Checklist

**Scope:** Only these 9 items are required for MVP. The AI board agent is for the **full app**, not MVP.

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Infinite board with pan/zoom | ✅ | Canvas: pan (select + drag empty), wheel zoom 0.1–5x, grid |
| 2 | Sticky notes with editable text | ✅ | Type `sticky_note`, double-click to edit text in place |
| 3 | At least one shape type (rectangle, circle, or line) | ✅ | Rectangle + Circle in toolbar; canvas draws both |
| 4 | Create, move, and edit objects | ✅ | Click to create; drag to move; double-click to edit text; resize handles; Delete key |
| 5 | Real-time sync between 2+ users | ✅ | `useRealtimeElements` — Postgres changes on `board_elements` |
| 6 | Multiplayer cursors with name labels | ✅ | `usePresence` + canvas draws peer cursors with name label |
| 7 | Presence awareness (who's online) | ✅ | PresenceBar: "N online" + avatars (you + peers) |
| 8 | User authentication | ✅ | Supabase Auth, `/auth` sign up/sign in |
| 9 | Deployed and publicly accessible | ✅ | Deploy to Vercel; set `NEXT_PUBLIC_SUPABASE_*` and optional `NEXT_PUBLIC_SITE_URL` (see README). |

**Bonus — AI Feature:**

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 10 | AI Board Assistant | ✅ | GPT-4o-mini powered: brainstorm ideas, create elements, summarize board, auto-organize layout. Always-on in board header. |
