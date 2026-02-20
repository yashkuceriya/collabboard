# CollabBoard — Submission Checklist & UI Improvement Ideas

Use this before submitting to ensure all requirements pass and to prioritize polish.

---

## Part 1: Submission Requirements (Verify Each)

### MVP (Hard gate — all must pass)

| # | Requirement | How to verify |
|---|-------------|----------------|
| 1 | Infinite board with pan/zoom | Open board → drag empty area to pan, scroll to zoom (0.1–5x). Grid dots visible. |
| 2 | Sticky notes with editable text | Add sticky (N or toolbar) → double-click → type → click outside. |
| 3 | At least one shape (rect, circle, or line) | Use Rectangle (R), Circle (O), or Line (L) from toolbar; draw on canvas. |
| 4 | Create, move, edit objects | Create any element, drag to move, double-click to edit text, use resize handles when selected. |
| 5 | Real-time sync (2+ users) | Open same board in two browsers (or incognito); create/move in one → see update in other. |
| 6 | Multiplayer cursors with names | Same as above; see other user’s cursor and name label on canvas. |
| 7 | Presence (who’s online) | Top bar shows “N online” and avatars. |
| 8 | User authentication | Sign up / Sign in from `/auth`; dashboard shows only your boards. |
| 9 | Deployed and publicly accessible | Open production URL; no “localhost” required. |

### Core board features

| Feature | How to verify |
|---------|----------------|
| Sticky notes | Create, edit text, change color (format panel when selected). |
| Shapes (rect, circle, line) | Toolbar: Rectangle, Circle, Line; draw by drag. All three work. |
| Connectors | Connect (A) → click edge of shape 1 → click edge of shape 2; arrow appears and follows shapes. |
| Text | Text (T) → click to add; double-click to edit. |
| **Frames** | **Frame (F)** in toolbar → drag to draw a frame. Add elements inside; move frame → children move. AI can also create frames. Double-click frame to edit title. |
| Transforms | Select element → drag to move; use corner handles to resize; format panel for rotation. |
| Multi-select | Shift+click to add to selection; or drag marquee on empty space. Delete/Backspace deletes all selected. |
| Delete, duplicate, copy/paste | Select → Delete/Backspace; Ctrl/Cmd+D duplicate; Ctrl/Cmd+C then Ctrl/Cmd+V copy/paste. |
| Pen & eraser | Draw (P) to freehand; Eraser (E) to click or drag over elements to delete. |

### Real-time

| Item | How to verify |
|------|----------------|
| Object sync | Edits appear for other users within a couple of seconds. |
| Conflict handling | Documented in README (LWW). |
| Reconnection | Documented in README; Supabase Realtime reconnects automatically. |

### AI agent

| Item | How to verify |
|------|----------------|
| 6+ command types | Open AI chat → try: “Add 3 sticky notes about product ideas”, “Create a frame called Sprint Planning”, “Connect these two shapes”, “Arrange in a grid”, “Change color of the note to red”. |
| getBoardState | AI can refer to existing elements by id. |
| createFrame | Ask “Create a frame called Backlog” or “Create a SWOT analysis” (uses frames). |
| Multi-step | Ask “Add a title, then add 3 stickies below it” → AI does multiple steps. |

### Your deliverables (you produce these)

| Deliverable | Status / action |
|-------------|------------------|
| Pre-Search document | Complete Phase 1–3 checklist; save and submit. |
| AI Development Log (1 page) | Describe tools, workflow, prompts, % AI vs hand-written, learnings. |
| AI Cost Analysis | Dev spend + projections (100 / 1K / 10K / 100K users). Use LangSmith for production data. |
| GitHub repo | README with setup, architecture, deployed link. |
| Demo video (3–5 min) | Show real-time collab, AI commands, and architecture. |
| Deployed app | Public URL, auth works, supports 5+ users. |
| Social post | X or LinkedIn with link and @GauntletAI. |

---

## Part 2: UI & Code Improvement Ideas

### Normal (collaborative) board

- **Toolbar**
  - Frame is in toolbar (F); draw-by-drag to create; elements inside move with frame. ✅ Done.
  - Optional: group toolbar into “Select / Shapes / Draw / Connect / Frame” with subtle separators.
- **Empty state**
  - Already shows Sticky, Rectangle, Circle, Frame, Text. ✅ Done.
  - Optional: one “Ask AI to get started” suggestion that opens chat with a pre-filled prompt.
- **Multi-select**
  - Optional: floating bar when multiple selected (“Delete all”, “Duplicate all”, “Group into frame”).
- **Frames**
  - Optional: right-click frame → “Add selection to frame” / “Remove from frame”.
- **Performance**
  - Viewport culling already in place; optional: lazy-load element details for very large boards.
- **Accessibility**
  - Focus rings on toolbar and modals. ✅ Done.
  - Optional: announce “Frame created” / “3 elements selected” for screen readers.

### Interview board

- **Empty state**
  - “Interview Board” intro with Draw, Code Block, Connect, Frame, Rectangle, Circle. ✅ Done.
- **Toolbar**
  - Frame (F) added for grouping components/diagrams. ✅ Done.
  - Timer and Templates already distinct. ✅ Done.
- **Chat**
  - Interview-specific intro and suggestions (system design, complexity, edge cases). ✅ Done.
- **Optional**
  - Interview-specific AI prompt hint: “I can help with system design, complexity, and edge cases.”
  - Template “System Design” could pre-create one frame + placeholder text.
  - Optional: “Practice mode” that hides timer until user starts it.

### Code quality / submission

- **README**
  - Architecture, conflict handling, reconnection, env vars, and Docker. ✅ Done.
- **REQUIREMENTS-SATISFACTION.md**
  - Maps brief to implementation; mark Frame toolbar as done. ✅ Done in this pass.
- **Database**
  - Ensure migration `20250218700000_line_element.sql` is applied so `line` type is allowed (run in Supabase SQL Editor if not using CLI).
- **Types**
  - `frame` and `line` in `ToolId` / `InterviewTool` / board state. ✅ Done.

---

## Part 3: Quick Pre-Submit Test Script

1. **Auth**: Sign out → sign in → see dashboard.
2. **New board**: Create board → add sticky, rectangle, frame (drag), line (drag).
3. **Frame**: Put sticky inside frame → move frame → sticky moves with it.
4. **Real-time**: Second browser → same board → move element in first → see in second.
5. **AI**: “Create a frame called Backlog and add 2 sticky notes inside it.”
6. **Interview**: Create interview board → see “Interview Board” empty state and Frame in toolbar.
7. **Multi-select**: Marquee select several elements → Delete → all removed.
8. **Copy/paste**: Select element → Ctrl+C → Ctrl+V → duplicate appears with offset.

If all pass, you’re in good shape for submission.
