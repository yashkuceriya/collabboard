# CollabBoard — Next Steps Roadmap

Brainstorm for post-MVP: AI, formatting, and UI polish.

---

## 1. UI: Clean Up the “Everything at Once” Problem

**Current:** Selecting an element shows a floating block (Fill, Text, Size, Font) plus a Delete button — all in one dense area.

**Goal:** Word/PowerPoint/Paint-style: **contextual ribbon or dropdowns** so the canvas stays clean and options are grouped.

### Ideas

| Approach | Description | Pros / Cons |
|----------|-------------|-------------|
| **Ribbon bar** | Horizontal strip below the top bar (or above the bottom toolbar) with tabs: **Format** (fill, text color, font, size), **Arrange** (bring forward, send back, align), **Insert** (optional). Only visible when something is selected. | Familiar (Office), scannable. Uses vertical space. |
| **Context menu + panel** | Right-click or long-press opens a **context menu** (Quick: Delete, Duplicate, Edit text). A **Properties panel** (slide-out from right or collapsible under toolbar) shows Fill, Text, Size, Font when an element is selected. | Canvas stays clear; power users get a panel. Panel can feel “separate” from the object. |
| **Dropdowns instead of rows** | Keep the floating toolbar but turn each row into a **dropdown**: “Fill ▼”, “Text ▼”, “Size ▼”, “Font ▼”. Click to expand that row only; pick one option and collapse. | Minimal change; less visual clutter; one section open at a time. |
| **Floating “Format” popover** | One button: “Format” or a paintbrush icon next to the selection. Click → single popover with **tabs** (Fill | Text | Size/Font) or **accordion** sections. | One compact popover; can hold more options later. |

**Recommendation:** Start with **dropdowns** (quick win, Word-like). Later add a **slide-out Format panel** for power users and more options.

---

## 2. Formatting: More Options, Same UI Pattern

**Colors**
- **Current:** Fixed palettes for Fill and Text (8 each).
- **Add:** “More colors…” → simple **color picker** (native `<input type="color">` or a small hue/sat picker). Optional: save “Recent colors”.
- **Add (later):** Opacity slider for fill (e.g. shape at 80% opacity).

**Size**
- **Current:** S / M / L (12, 14, 18px).
- **Add:** One more step (e.g. XL 22px) or a **numeric input** (e.g. 10–28px) in the dropdown or panel.

**Text style**
- **Current:** Font family (Sans, Serif, Mono, Hand).
- **Add:**
  - **Weight:** Regular / Bold (canvas: `ctx.font = \`${weight} ${size}px ${family}\``).
  - **Style:** Normal / Italic (where supported).
  - **Alignment:** Left / Center / Right (for sticky and text elements; already have center for circle).
- **Add (later):** Underline, strikethrough (draw with line after measuring text).

**Where to put them**
- In the **dropdowns** or **Format popover**: “Fill ▼”, “Text color ▼”, “Size ▼”, “Font ▼”, “Style ▼” (Bold/Italic), “Align ▼”.
- Avoid adding more rows to the current block; use the same space with expand/collapse.

---

## 3. AI: Work Better + More Features

### Make AI “work better”

| Area | Current | Improvement |
|------|---------|-------------|
| **Context** | System prompt describes tools and board units. | Add **recent board state** in the system message (e.g. “Last 20 elements: id, type, x, y, text”) so the model knows what’s there without calling `getBoardState` every time. Optional: send a short “board summary” (counts by type, sample text) on each turn. |
| **Connectors** | AI can’t create or suggest arrows. | Add tool **createConnector(fromId, toId)**. Let the model call it when the user says “connect the idea sticky to the goal rectangle” (after resolving names to ids via getBoardState). |
| **Positioning** | AI places at fixed offsets (50, 50 + 220*i). | Smarter layout: e.g. “place to the right of the last sticky” using getBoardState; avoid overlapping. |
| **Errors** | Failed tool calls may not be retried. | On tool error, return error to the model so it can adjust (e.g. “element not found”, “invalid id”). |
| **Confirmation** | User doesn’t always see what changed. | Short assistant reply after tools: “Added 3 stickies: Ideas, Goals, Blockers.” |

### More AI features

| Feature | Description |
|---------|-------------|
| **“Suggest connections”** | User asks “suggest connections between these”. AI calls getBoardState, then createConnector for pairs it infers (e.g. by text similarity or order). |
| **“Summarize” as sticky** | Already can summarize in text; add **createStickyNote** with that summary so a “Summary” sticky appears on the board. |
| **“Generate from prompt”** | “Create a simple Kanban: To Do, In Progress, Done” → AI creates 3 columns (rectangles or groups) and optional stickies. |
| **“Improve this text”** | User selects a sticky; “make it shorter” / “make it professional”. AI uses updateText; show diff or replace. |
| **Templates** | Buttons or prompts: “Brainstorm”, “Meeting notes”, “Retro”. AI creates a starter layout (e.g. 5 stickies with titles). |
| **Natural language move** | “Move the risks sticky next to the goals one.” AI uses getBoardState → moveObject with computed positions. |

### Technical tweaks

- **Streaming + tools:** Keep streaming; when the model uses a tool, run it and append the result; continue the turn so the model can use more tools or reply.
- **Rate limiting / cost:** Cap tool calls per request (e.g. 10); optional per-user daily limit for AI requests.
- **Model:** Consider gpt-4o for complex layout/parsing; keep gpt-4o-mini for simple create/summarize.

---

## 4. Other Features (Backlog)

- **Duplicate element** (Ctrl+D or context menu).
- **Copy / Paste** (single element or selection).
- **Undo / Redo** (stack of operations; harder with real-time sync — might be local-only or last-N-ops).
- **Layers / z-order:** “Bring to front”, “Send to back” (store a `z_index` or sort by it).
- **Grouping:** Group elements so they move together (optional “group” object; connectors could attach to group).
- **Images:** Upload image as a board element (blob or URL).
- **Export:** PNG/PDF of visible viewport.
- **Board templates:** “Start from template” (e.g. Brainstorm, Retro) that inserts a preset layout.

---

## 5. Suggested Order of Work

1. **UI: Dropdowns for Format** — Replace the 4 rows with “Fill ▼”, “Text ▼”, “Size ▼”, “Font ▼” so only one section is open at a time. Keeps the same options, less clutter.
2. **Formatting: More options** — Add “More colors”, Bold, Alignment in the same dropdown/popover.
3. **AI: createConnector + better replies** — So the AI can connect shapes and confirm what it did.
4. **AI: Smarter layout** — Use getBoardState to place new elements without overlap; “summarize as sticky”.
5. **UI: Format panel (optional)** — Slide-out panel for full control (all colors, sizes, fonts, style) for users who want it.
6. **Backlog** — Duplicate, layers, templates as time allows.

---

## 6. One-Paragraph “Vision”

Post-MVP, CollabBoard should feel like a **lightweight Miro/FigJam**: the canvas stays clean, and formatting is in **dropdowns or a small Format popover** (Word/PowerPoint style) instead of a big floating block. The **AI** can create and **connect** elements, summarize onto the board, and follow natural-language layout requests, with clear confirmations. Formatting grows to **more colors, sizes, bold/italic, alignment** without crowding the UI. Later, **templates, duplicate, layers, and export** round out collaboration and presentation.

You can use this doc as a backlog and tick items off as you implement them.
