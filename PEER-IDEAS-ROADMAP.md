# Peer ideas roadmap — from peer apps & video

Ideas taken from peer work (COLLABBOARD profile/boards, version history UI, SPACE PORT dashboard, etc.) and your goals: smoothness/FPS, profile emojis, rotations, version history, AI chat history, and extras.

---

## 1. Performance & smoothness (FPS)

**Peer observation:** One app showed **120 FPS** in the bottom status bar next to object count and user count.

**Current state:** CollabBoard has FPS in the perf panel when `?perf=1`; canvas uses `requestAnimationFrame` and LOD for zoom.

**Plan:**
- [ ] **Surface FPS in normal UI** (e.g. bottom-left or next to zoom): small “XX FPS” badge so users see smoothness; optional toggle so it doesn’t clutter.
- [ ] **Target 60 FPS minimum**, 120 FPS where possible (throttle heavy work, avoid layout thrash, keep draw loop lean).
- [ ] **Keep existing optimizations:** LOD when zoomed out, spatial index for hit-test, batched realtime updates.

---

## 2. Profile & “profile emojis”

**Peer observation:** Profile page with name (first/last), email (read-only), **avatar color** (9 swatches), and **preview** (initial letter on colored circle). Header shows circular avatar (e.g. “Y” on pink) and dropdown: Profile, Sign out.

**Current state:** CollabBoard has display name (from `user_metadata`), avatar/color for presence and cursors (from presence or fixed palette). May or may not have a dedicated Profile page with editable name + avatar color.

**Plan:**
- [ ] **Profile page/settings:** Dedicated route (e.g. `/profile` or from dashboard) with:
  - Email (read-only).
  - First name / Last name (optional), saved to `user_metadata` so display name and initials stay in sync.
  - **Avatar color** picker (same 8–10 colors as presence) with live **preview** (initial on colored circle).
  - Save button → update Supabase auth `user_metadata`.
- [ ] **Profile emojis:** Either:
  - **Option A:** Allow choosing an **emoji** (or icon) in addition to initial — e.g. “Y” or “😀” in the circle; store in `user_metadata.avatar_emoji` and render in header, presence bar, and cursor label.
  - **Option B:** Keep initial-only but ensure avatar color + initial are shown everywhere (header, presence, board chat, cursors) for consistency.
- [ ] **Header:** Ensure profile dropdown (avatar + “Profile” + “Sign out”) is clear and matches peer UX.

---

## 3. Rotations

**Peer observation:** Rotations are a standard expectation (objects can be rotated). Your app already has a rotation handle below the selected element.

**Plan:**
- [ ] **Keep current behavior:** Single rotation handle below selection; no ring; cardinal snap + angle tooltip.
- [ ] **Optional polish:** Keyboard shortcut (e.g. R or arrow keys for 15° steps), or “Rotate 90°” in context menu if you add one later.

---

## 4. Version history

**Peer observation:** **Version History** sidebar on the right: “All users’ changes. Restore syncs to the board for everyone.” Filters: **All users**, **All operations**. List of change groups (e.g. “3m ago • 6 changes”) with entries like “Create line”, “Update object Unknown” and timestamps. **“< Restore”** per group to revert board to that point.

**Current state:** No version history or restore in CollabBoard.

**Plan (larger feature):**
- [ ] **Data model:** Persist **snapshots** or **deltas** of the board over time (e.g. per-board history table: `board_id`, `created_at`, `user_id`, `snapshot JSON` or `operation log`). Consider retention (e.g. last 30 days or last N snapshots).
- [ ] **Version History panel (right sidebar):**
  - Title: “Version History”; short copy: “All users’ changes. Restore syncs to the board for everyone.”
  - **Filters:** “All users” (dropdown), “All operations” (e.g. Create / Update / Delete / All).
  - **Timeline:** Grouped by time (e.g. “3m ago”, “Yesterday”, “Fri”) with count (“6 changes”).
  - **Entries:** Icon + short description (e.g. “Create line”, “Update object [name]”) + timestamp.
  - **Restore:** “< Restore” (or “Restore”) per group → replace current board state with that snapshot and broadcast so everyone sees it.
- [ ] **Implementation options:**  
  - **Snapshot:** On a timer or on “significant” change, store full `board_elements` for that board; Restore = replace all elements from snapshot.  
  - **Operation log:** Append-only log of create/update/delete; Restore = replay log up to a point (more complex, smaller storage if many small edits).

---

## 5. AI chat history (24 hrs per board)

**Peer observation:** Not shown in images; you specified **AI chat history (24 hrs per board)**.

**Current state:** Board chat likely exists (BoardChatPanel) and may or may not persist messages (e.g. in DB or only in memory).

**Plan:**
- [ ] **Persistence:** Store board chat messages in DB (e.g. `board_chat_messages`: `board_id`, `user_id`, `role` (user/assistant), `content`, `created_at`). Optional: only store “AI” thread (user + assistant) if you want to keep it separate from general board chat.
- [ ] **Retention:** **24 hours** per board: when loading messages, only fetch where `created_at > now() - 24h`; optional nightly job or on-load prune to delete older rows.
- [ ] **UI:** Show history in the same board chat panel (scrollable past messages); optionally “New conversation” to clear local view and start fresh (without deleting DB history until 24h has passed).

---

## 6. Other observations from peers

- **Top bar (board view):** Back to Boards, File / Edit menus, board title (e.g. “Testy”), user avatar, **Online** status (green dot), **undo/redo** (circular arrow), **clock** (history/activity), **help** (?).  
  **Ideas:** Optional undo/redo for local or server-backed ops; “Activity” or “History” icon that opens version history; help link or modal.

- **Zoom widget:** Single widget (minus, %, plus) in one place — you already consolidated to one; keep it that way.

- **Bottom bar:** FPS, object count, user count, “Reset” (e.g. viewport or test data).  
  **Ideas:** Optional compact status (e.g. “52 obj · 1 user” + optional FPS) for power users.

- **Dashboard (SPACE PORT):** **Templates** (Kanban, SWOT, Brainstorm, Retrospective, User Journey, Pros & Cons), **“Your boards”** with card per board: **thumbnail**, title, last modified, **star**, **delete**. **Search**, **+ New board**, view toggles (grid/list).  
  **Ideas:**  
  - Board **thumbnails** (mini canvas or placeholder) on dashboard.  
  - **Starred boards** (or “favorites”) and “Recent” (you may have recent already).  
  - **Delete board** from card (with confirm).  
  - **Templates** on dashboard (you may have templates in interview mode; could add “Start from template” on dashboard too).

- **Profile / identity:** Consistent avatar (color + initial or emoji) in header, presence, and board chat so “profile emojis” and identity are clear everywhere.

---

## Suggested implementation order

1. **Quick wins:** Profile page (name + avatar color + preview); optional FPS badge in normal UI; ensure single zoom widget and rotation handle are shipped.
2. **Profile emojis:** Add optional emoji/icon to profile and show in header, presence, cursors.
3. **AI chat 24h:** Persist board AI chat in DB with 24h retention and show in panel.
4. **Version history:** Design snapshot vs operation-log; implement Version History sidebar with filters and Restore.
5. **Dashboard polish:** Board thumbnails, star, delete from card; optional “Start from template” on dashboard.
6. **Extra UX:** Undo/redo (if feasible), Activity/History icon, help link.

---

*Document created from peer app screens and your priorities (smoothness, profile emojis, rotations, version history, AI chat 24h). Rotations and zoom are already addressed; focus next on profile, FPS visibility, then version history and AI chat persistence.*
