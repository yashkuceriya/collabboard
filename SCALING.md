# CollabBoard — Scaling & performance

This document describes scale targets, metrics, and implementation choices for boards with **500+ objects** and multiple concurrent users.

---

## Scale targets (PRD-style)

| Metric | Target | Notes |
|--------|--------|--------|
| **Objects per board** | 500+ | Canvas and realtime must remain usable (pan, zoom, select, draw). |
| **FPS** | 60 (pan/zoom/draw) | Single requestAnimationFrame draw; viewport culling; no continuous rAF loop. |
| **Object sync latency** | &lt;100 ms | Supabase Realtime postgres_changes + broadcast fallback. |
| **Cursor sync** | &lt;50 ms typical | Broadcast throttle 50 ms (~20 fps) to balance responsiveness and load. |
| **AI response time** | &lt;5 s for typical commands | Single-call patterns (e.g. generateIdeas), max 3 tool steps, maxOutputTokens 1024. |
| **Hit-test (click/move)** | O(cell) not O(n) for large n | Spatial index when element count &gt; 80. |
| **Time to interactive** | &lt;3 s | One board load + one Realtime subscribe. |

---

## Implemented optimizations

### 1. Canvas — viewport culling

- Only elements whose bounding box intersects the visible viewport are drawn.
- Grid dots are drawn only for the visible range.
- **Effect:** Constant draw cost per frame with respect to total object count (only visible objects rendered).

### 2. Canvas — spatial index for hit-test and marquee

- When `elements.length > 80`, a **spatial grid** is built (cell size 250 px).
- **Hit-test:** Point queries use the single cell under the cursor; only elements in that cell (and connectors in a separate pass) are tested. Connectors are not in the grid and are tested in one pass.
- **Marquee selection:** Cells intersecting the marquee rect are queried; candidates are then filtered by actual rect overlap.
- **Effect:** Hit-test and marquee scale with local density instead of total object count (e.g. 500 objects → ~20–50 tests per interaction instead of 500).

### 3. Canvas — O(1) connector endpoint lookup

- A single **id → element** `Map` is built from `elements` (memoized when `elements` changes).
- Connector drawing and hit-test use this map instead of repeated `elements.find(...)`.
- **Effect:** Connector draw and hit-test are O(1) per connector instead of O(n) per connector.

### 4. Cursor broadcast throttle

- Cursor position is broadcast at most every **50 ms** (~20 fps).
- **Effect:** Lower Realtime load with many users while keeping cursors responsive.

### 5. AI — fewer tool rounds and bulk operations

- **Max tool steps:** 3 (was 5) to cap latency.
- **generateIdeas:** One frame insert + **one bulk insert** for all stickies (no per-sticky round trip).
- **Prompt:** Model is instructed to use generateIdeas for “add N stickies” instead of N× createStickyNote.
- **maxOutputTokens:** 1024 to keep replies short.
- **Effect:** “Add 3 stickies” completes in one generateIdeas call (~2–4 s instead of 10+ s).

---

## Metrics to monitor

- **FPS:** Use `?perf=1` on the board; FPS is shown when perf mode is on. Target 60.
- **Object sync:** With `?perf=1`, broadcast payloads log latency (ms) in the console.
- **Cursor sync:** With `?perf=1`, cursor broadcast logs latency in the console.
- **AI:** LangSmith (or similar) traces for latency and token usage per request.

---

## Limits and trade-offs

- **Spatial index:** Rebuilt when `elements` changes (one pass). No incremental updates.
- **Connectors:** When using the spatial index, connectors are still tested in a full pass (their endpoints span cells). For 500 elements with ~100 connectors this remains acceptable.
- **Realtime:** Supabase limits (e.g. connection count, message size) apply; 500 elements × N users is within typical usage.
- **Database:** Single `select *` for board load; 500 rows is fine. No pagination for board load today.

---

## Quick verification at scale

1. Create a board and add 100+ elements (e.g. via AI: “add 8 stickies” multiple times, or duplicate).
2. Pan and zoom; FPS should stay smooth (no visible stutter).
3. Click to select; resize; marquee select — all should feel instant.
4. Open the same board in a second browser; confirm sync and cursor visibility.
5. In LangSmith (if enabled), confirm “add 3 stickies”–style requests complete in a few seconds.
