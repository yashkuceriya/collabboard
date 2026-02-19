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
| 10 | AI Board Assistant | ✅ | GPT-4o powered: brainstorm ideas, create elements, summarize board, auto-organize layout. Interview boards get interview-style prompts; normal boards get creative prompts. Fun facts/jokes on request. |

**Beyond MVP — Extra features:**

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 11 | Interview boards | ✅ | Create via "+ Interview Board" on dashboard; board type stored as `is_interview`. Interview toolbar: pen, eraser, type, shapes, code block, system-design/algorithm templates, timer. Dashboard tab "Interview" and badge on cards. |
| 12 | Board chat | ✅ | Real-time chat for users on the same board. Table `board_chat_messages`; Realtime for new messages. "Chat" button on board opens panel; shows online count. |
| 13 | Freehand + eraser | ✅ | Pen tool draws freehand strokes; eraser deletes any element (not just freehand). Migration adds `freehand` element type. |
| 14 | Rotation | ✅ | Stickies/shapes/text support `properties.rotation` (degrees). Format panel: Rotation presets (-15° to 15°). New stickies get a small random tilt. |
| 15 | Text UX | ✅ | Cursor starts at top when editing; Enter adds new line; Ctrl/Cmd+Enter saves. Code block: larger font and contrast. |
| 16 | Recent / History | ✅ | Dashboard "Recent" tab shows boards you opened recently (last 20, from localStorage). Sorted by last opened. "Clear recent" and per-card "Remove from recent" on hover. |
