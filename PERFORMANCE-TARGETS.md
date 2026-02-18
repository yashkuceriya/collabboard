# Performance Targets

How CollabBoard meets (or how to verify) each performance criterion.

| Metric | Target | Status | Notes |
|--------|--------|--------|-------|
| **Frame rate** | 60 FPS during pan, zoom, object manipulation | ✅ Addressed | Redraw on state change via `requestAnimationFrame`; viewport culling so only visible elements are drawn (supports 500+ objects). |
| **Object sync latency** | <100ms | ✅ Architecture | Supabase Realtime `postgres_changes` + broadcast fallback; typical round-trip is well under 100ms. Verify with two clients and a stopwatch or devtools. |
| **Cursor sync latency** | <50ms | ✅ Addressed | Cursor broadcasts throttled to ~35ms (`use-presence.ts`); Supabase broadcast is low-latency. Receivers update on each message. |
| **Object capacity** | 500+ objects without performance drops | ✅ Addressed | Viewport culling in canvas: only elements (and connectors) whose bounds intersect the visible area are drawn. Off-screen objects are skipped. |
| **Concurrent users** | 5+ without degradation | ✅ Architecture | Presence + broadcast scale with user count. Cursor throttle (35ms) keeps message volume reasonable. No per-user state that grows unbounded. |

---

## How to run checks (FPS, cursor sync, object sync latency)

1. **Start the app:** `pnpm dev` and open `http://localhost:3000`.
2. **Log in** and open any board (or create one).
3. **Enable perf mode:** Add `?perf=1` to the board URL (e.g. `http://localhost:3000/board/abc123?perf=1`) and reload.
4. **FPS:** A green **FPS** counter appears top-left. Pan, zoom, and move objects; the value is canvas redraws per second (target ≥60 during interaction).
5. **Cursor sync latency:** Open the **same board** in a second browser (or incognito) as another user, with `?perf=1` on that URL. Move the mouse in one window; in the **other** window open DevTools → Console. You should see `[perf] cursor sync latency (ms): XX` (target <50ms).
6. **Object sync latency:** With two clients on the same board (both with `?perf=1`), create or move an element in one. In the **other** client's console look for `[perf] object sync latency (ms): XX` or `object sync (update) latency (ms): XX` (target <100ms).

## Verification (optional)

- **Frame rate:** Open a board with many elements, pan/zoom; use Chrome DevTools → Performance (or “Rendering” → “Frame rate meter”) and confirm ~60 FPS.
- **Object sync:** Two browsers on the same board; create/move an object in one and note time until it appears/updates in the other (should feel instant, <100ms).
- **Cursor sync:** Two users; move cursor and watch the other client (smooth, <50ms).
- **500+ objects:** Create or seed a board with 500+ elements; pan around and confirm smooth pan/zoom (culling keeps draw cost bounded by visible count).
- **5+ users:** Invite 5 people to the same board; confirm cursors and edits still sync and UI remains responsive.
