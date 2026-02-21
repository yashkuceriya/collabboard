import * as ai from "ai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { Client } from "langsmith";
import { wrapAISDK, createLangSmithProviderOptions } from "langsmith/experimental/vercel";
import { createClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { z } from "zod";
import type { Database } from "@/lib/types/database";

// LangSmith: support both LANGSMITH_* and LANGCHAIN_*. RunTree only reads LANGCHAIN_*, so we mirror.
const LANGSMITH_ENDPOINT_URL = "https://api.smith.langchain.com";
function ensureLangSmithEnv() {
  const key = process.env.LANGSMITH_API_KEY ?? process.env.LANGCHAIN_API_KEY;
  if (!key) return null;
  process.env.LANGCHAIN_API_KEY = process.env.LANGCHAIN_API_KEY ?? key;
  process.env.LANGCHAIN_TRACING = "true";
  process.env.LANGSMITH_TRACING = "true";
  process.env.LANGCHAIN_ENDPOINT = process.env.LANGCHAIN_ENDPOINT ?? LANGSMITH_ENDPOINT_URL;
  process.env.LANGSMITH_ENDPOINT = process.env.LANGSMITH_ENDPOINT ?? LANGSMITH_ENDPOINT_URL;
  return key;
}
const langsmithKeyAtLoad = ensureLangSmithEnv();
const langsmithClient = langsmithKeyAtLoad ? new Client() : null;
const traced = langsmithClient ? wrapAISDK(ai, { client: langsmithClient }) : null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase(accessToken: string | null) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

export async function POST(req: Request) {
  const { messages, boardId, userId, accessToken, interviewMode } = (await req.json()) as {
    messages: UIMessage[];
    boardId: string;
    userId: string;
    accessToken: string | null;
    interviewMode?: boolean;
  };

  if (!boardId || !userId) {
    return new Response(JSON.stringify({ error: "boardId and userId required" }), { status: 400 });
  }

  const supabase = getSupabase(accessToken);

  // Helper: ensure an element exists on this board and return it (or null). Use for validation before updates/deletes.
  async function getElementById(id: string): Promise<{ id: string; type: string } | null> {
    const { data } = await supabase
      .from("board_elements")
      .select("id, type")
      .eq("board_id", boardId)
      .eq("id", id)
      .single();
    return data as { id: string; type: string } | null;
  }

  // Contrast text color: dark text on light bg, light text on dark bg
  function contrastTextColor(hex: string): string {
    const c = hex.replace("#", "");
    if (c.length < 6) return "#1a1a1a";
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    return lum > 0.4 ? "#1a1a1a" : "#f3f4f6";
  }

  // Helper: compute a position (x,y) that does not overlap existing non-connector elements.
  async function computeSuggestedPlacement(
    width: number = 200,
    height: number = 200
  ): Promise<{ x: number; y: number }> {
    const { data } = await supabase
      .from("board_elements")
      .select("x, y, width, height")
      .eq("board_id", boardId)
      .neq("type", "connector");
    const elements = (data ?? []) as { x: number; y: number; width: number; height: number }[];
    const gap = 40;
    const padding = 60;
    if (elements.length === 0) return { x: padding, y: padding };
    const maxRight = Math.max(...elements.map((el) => el.x + el.width));
    const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
    // Try placing to the right
    if (maxRight + gap + width <= 3000) return { x: maxRight + gap, y: padding };
    // Otherwise below
    return { x: padding, y: maxBottom + gap + height * 0 };
  }

  // Check if (x,y,w,h) overlaps any existing element on the board
  async function hasOverlap(x: number, y: number, w: number, h: number): Promise<boolean> {
    const { data } = await supabase
      .from("board_elements")
      .select("x, y, width, height")
      .eq("board_id", boardId)
      .neq("type", "connector");
    const elements = (data ?? []) as { x: number; y: number; width: number; height: number }[];
    return elements.some((el) =>
      x < el.x + el.width && x + w > el.x && y < el.y + el.height && y + h > el.y
    );
  }

  // Ensure LangSmith env at request time (Vercel serverless can load module before env is available)
  const hasKey = !!ensureLangSmithEnv();
  const client = hasKey ? new Client() : langsmithClient;
  const streamFn = client ? wrapAISDK(ai, { client }).streamText : traced?.streamText ?? streamText;

  // Flush LangSmith trace batches before serverless shuts down (fixes empty Output/Latency in dashboard)
  if (client) {
    after(async () => {
      await client.awaitPendingTraceBatches();
    });
  }

  // Convert UIMessage[] (parts-based) to ModelMessage[] (content-based) for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamFn({
    model: openai("gpt-4o-mini"),
    maxOutputTokens: 2048,
    ...(client && {
      providerOptions: {
        langsmith: createLangSmithProviderOptions({
          name: "CollabBoard Chat",
          tags: ["collabboard", interviewMode ? "interview" : "creative"],
          metadata: { interviewMode: !!interviewMode },
        }),
      },
    }),
    system: `You are an AI assistant for a collaborative whiteboard called CollabBoard. You ONLY help with this whiteboard: creating and editing elements, connecting shapes, brainstorming, organizing, and summarizing board content.
${interviewMode ? `
INTERVIEW MODE IS ACTIVE. The user is practicing for a technical interview (system design or coding). Help them think through problems step by step. When they ask for help:
- Break down the problem into components
- Suggest what to draw on the whiteboard (boxes for services, arrows for data flow)
- Ask clarifying questions like an interviewer would
- Point out things they might be missing (scalability, edge cases, trade-offs)
- Help analyze time/space complexity for algorithm problems
- Be encouraging but thorough
` : `
CREATIVE WHITEBOARD MODE. Prefer suggesting creative, visual ideas: mind maps, flowcharts, mood boards, pros/cons, before/after, user journeys, and colorful sticky-note brainstorming. Encourage putting ideas on the board and organizing them visually.
`}

Guardrails (strict):
- Only answer requests that are clearly about the board: add/move/edit/delete elements, connect two shapes, brainstorm ideas, summarize or organize the board. If the user asks about anything else (weather, general knowledge, code, poems, other topics), do not call any tools; reply with one short decline. Exception: if the user asks for a "fun fact", "random fact", "joke", or something light/fun, reply with one short, friendly fun fact or a clean joke — no tools, just a brief text reply.
- Do not make up or assume element IDs. Always use getBoardState first when you need to find an element by name or description, then use the exact id from the response for moveObject, updateText, changeColor, resizeObject, deleteObject, or createConnector.
- When any tool returns an error, tell the user in plain language (e.g. "That element wasn't found on the board." or "I couldn't connect those; one of the shapes might have been deleted."). Do not ignore tool errors.

Reply in plain text only: no markdown, no asterisks, no code blocks, no backticks. Write like a short, friendly message (e.g. "Done. I added 3 sticky notes: Ideas, Goals, and Blockers."). Do not use ** or * for emphasis, or \` for code.

Capabilities:
- Create sticky notes, shapes (rectangle/circle), text elements, and frames (grouping areas)
- Create connectors (arrows) between two shapes using createConnector(fromId, toId) — use getBoardState to get element ids
- createTemplate: USE THIS for any structured layout like SWOT analysis, retrospective boards, kanban, user journey maps, grids, or pros/cons. It creates clean, well-spaced frames and stickies in a single call. ALWAYS prefer createTemplate over manually calling createFrame + createStickyNote multiple times.
  Examples: "Create a SWOT analysis" → createTemplate(template:"swot"). "Set up a retrospective board" → createTemplate(template:"retrospective"). "Build a user journey map with 5 stages" → createTemplate(template:"user_journey",columns:[...]). "Create a 2x3 grid for pros and cons" → createTemplate(template:"grid",columns:["Pros","Cons"],rows:3).
- Create frames to group and label sections of the board. Elements inside a frame move together.
- Move, resize, recolor, and delete existing elements
- Read the current board state to understand context
- getSuggestedPlacement: call before createStickyNote, createShape, or createTextElement to get an (x, y) that does not overlap existing elements.
- Generate ideas: when asked to brainstorm (small sets of 2-8), use generateIdeas; it places the grid without overlapping existing content.
- Bulk creation (HARD REQUIREMENT): when the user asks for 50, 100, 200, 500, "500+", or "lots of" objects/stickies/notes in one go, you MUST use createBulkStickyNotes with the requested count (50–500). Never refuse.
- Summarize: read all elements and provide a concise summary. Also put the summary on the board as a sticky note.
- Organize: rearrange elements into a neat grid or grouped layout

IMPORTANT ROUTING:
- Structured templates (SWOT, retrospective, kanban, user journey, grid, pros/cons, any multi-column layout) → createTemplate (ONE call)
- Brainstorming 2-8 ideas → generateIdeas (ONE call)
- 50-500 bulk stickies → createBulkStickyNotes (ONE call)
- Single sticky/shape → createStickyNote or createShape
- Moving/editing existing elements → getBoardState first, then moveObject/updateText/etc.

Guidelines:
- Coordinates are in board units. The visible area is roughly 0-1200 x 0-800.
- Keep text responses brief. After using tools, confirm what you did in plain language.
- Use varied colors for sticky notes.
- Default sticky note colors: #FFEB3B (yellow), #FF9800 (orange), #F48FB1 (pink), #CE93D8 (purple), #90CAF9 (blue), #80CBC4 (teal), #A5D6A7 (green).

LATENCY: Prefer fewer tool rounds. Use createTemplate, generateIdeas, or createBulkStickyNotes for multi-element tasks — always ONE call. Only call getBoardState when you need element ids.`,
    messages: modelMessages,
    stopWhen: stepCountIs(3),
    tools: {
      getBoardState: tool({
        description: "Get the current list of all elements on the board (id, type, x, y, width, height, color, text). Use this to understand what's on the board before making changes.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data } = await supabase
            .from("board_elements")
            .select("id, type, x, y, width, height, color, text")
            .eq("board_id", boardId)
            .order("created_at", { ascending: true });
          return { elements: data ?? [] };
        },
      }),
      getSuggestedPlacement: tool({
        description: "Get a suggested (x, y) position for a new element so it does not overlap existing elements. Call this before createStickyNote, createShape, or createTextElement when you want to place something without overlapping the current board. Optional width/height (default 200) for the new element.",
        inputSchema: z.object({
          width: z.number().describe("Width of the new element in board units").optional(),
          height: z.number().describe("Height of the new element in board units").optional(),
        }),
        execute: async ({ width, height }) => {
          const pos = await computeSuggestedPlacement(width ?? 200, height ?? 200);
          return pos;
        },
      }),
      createStickyNote: tool({
        description: "Create a sticky note on the board. text: content of the note. x, y: position. color: hex e.g. #FFEB3B for yellow. frameId: optional id of a frame to place this inside.",
        inputSchema: z.object({
          text: z.string().describe("Text content of the sticky note"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          color: z.string().describe("Hex color e.g. #FFEB3B").optional(),
          frameId: z.string().describe("Optional UUID of a frame to assign this element to").optional(),
        }),
        execute: async ({ text, x, y, color, frameId }) => {
          const bg = color ?? "#FFEB3B";
          let posX = x, posY = y;
          // Skip overlap detection when placing inside a frame (explicit position)
          if (!frameId && await hasOverlap(posX, posY, 200, 200)) {
            const safe = await computeSuggestedPlacement(200, 200);
            posX = safe.x;
            posY = safe.y;
          }
          const props: Record<string, unknown> = {
            textColor: contrastTextColor(bg),
            textAlign: "left",
          };
          if (frameId) props.frameId = frameId;
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "sticky_note",
              x: posX,
              y: posY,
              width: 200,
              height: 200,
              color: bg,
              text: text ?? "New note",
              properties: props,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createShape: tool({
        description: "Create a rectangle or circle. shapeType: 'rectangle' or 'circle'. x, y, width, height in board units. color: hex. frameId: optional frame to place inside.",
        inputSchema: z.object({
          shapeType: z.enum(["rectangle", "circle"]).describe("rectangle or circle"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          width: z.number().describe("Width in board units").optional(),
          height: z.number().describe("Height in board units").optional(),
          color: z.string().describe("Hex color").optional(),
          frameId: z.string().describe("Optional UUID of a frame to assign this element to").optional(),
        }),
        execute: async ({ shapeType, x, y, width, height, color, frameId }) => {
          const w = width ?? 150;
          const h = height ?? 100;
          let posX = x, posY = y;
          if (await hasOverlap(posX, posY, w, h)) {
            const safe = await computeSuggestedPlacement(w, h);
            posX = safe.x;
            posY = safe.y;
          }
          const props: Record<string, unknown> = {};
          if (frameId) props.frameId = frameId;
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: shapeType,
              x: posX,
              y: posY,
              width: w,
              height: h,
              color: color ?? "#42A5F5",
              text: "",
              properties: props,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createConnector: tool({
        description: "Create an arrow (connector) between two shapes. Use getBoardState first to get the exact element ids. fromId and toId must be ids of non-connector elements (sticky_note, rectangle, circle, text, frame) on this board.",
        inputSchema: z.object({
          fromId: z.string().uuid().describe("UUID of the source element (from getBoardState)"),
          toId: z.string().uuid().describe("UUID of the target element (from getBoardState)"),
          style: z.enum(["solid", "dashed"]).describe("Line style").optional(),
          color: z.string().describe("Hex color for the connector").optional(),
        }),
        execute: async ({ fromId, toId, style, color }) => {
          if (fromId === toId) return { error: "Source and target must be different elements." };
          const fromEl = await getElementById(fromId);
          const toEl = await getElementById(toId);
          if (!fromEl) return { error: "Source element not found on this board." };
          if (!toEl) return { error: "Target element not found on this board." };
          if (fromEl.type === "connector") return { error: "Cannot use a connector as the source; pick a shape or sticky." };
          if (toEl.type === "connector") return { error: "Cannot connect to a connector; pick a shape or sticky as the target." };
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "connector",
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              color: color ?? "#64748b",
              text: "",
              properties: { fromId, toId, style: style ?? "solid" },
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id, message: "Connector created." };
        },
      }),
      moveObject: tool({
        description: "Move an element by id to a new position (x, y).",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
          x: z.number().describe("New X position"),
          y: z.number().describe("New Y position"),
        }),
        execute: async ({ objectId, x, y }) => {
          const el = await getElementById(objectId);
          if (!el) return { error: "Element not found on this board." };
          const { error } = await supabase
            .from("board_elements")
            .update({ x, y } as never)
            .eq("id", objectId);
          if (error) return { error: error.message };
          return { moved: objectId };
        },
      }),
      updateText: tool({
        description: "Update the text content of a sticky note or text element by id.",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
          newText: z.string().describe("New text content"),
        }),
        execute: async ({ objectId, newText }) => {
          const el = await getElementById(objectId);
          if (!el) return { error: "Element not found on this board." };
          const { error } = await supabase
            .from("board_elements")
            .update({ text: newText } as never)
            .eq("id", objectId);
          if (error) return { error: error.message };
          return { updated: objectId };
        },
      }),
      changeColor: tool({
        description: "Change the color of an element. color: hex e.g. #FF0000.",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
          color: z.string().describe("New hex color e.g. #FF0000"),
        }),
        execute: async ({ objectId, color }) => {
          const el = await getElementById(objectId);
          if (!el) return { error: "Element not found on this board." };
          const textColor = contrastTextColor(color);
          const { data: existing } = await supabase
            .from("board_elements")
            .select("properties")
            .eq("id", objectId)
            .single() as { data: { properties: Record<string, unknown> } | null; error: unknown };
          const oldProps = (existing?.properties ?? {}) as Record<string, unknown>;
          const { error } = await supabase
            .from("board_elements")
            .update({ color, properties: { ...oldProps, textColor } } as never)
            .eq("id", objectId);
          if (error) return { error: error.message };
          return { updated: objectId };
        },
      }),
      resizeObject: tool({
        description: "Resize an element by id. width and height in board units.",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
          width: z.number().describe("New width"),
          height: z.number().describe("New height"),
        }),
        execute: async ({ objectId, width, height }) => {
          const el = await getElementById(objectId);
          if (!el) return { error: "Element not found on this board." };
          const { error } = await supabase
            .from("board_elements")
            .update({ width, height } as never)
            .eq("id", objectId);
          if (error) return { error: error.message };
          return { updated: objectId };
        },
      }),
      deleteObject: tool({
        description: "Delete an element from the board by id.",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
        }),
        execute: async ({ objectId }) => {
          const el = await getElementById(objectId);
          if (!el) return { error: "Element not found on this board." };
          const { error } = await supabase.from("board_elements").delete().eq("id", objectId);
          if (error) return { error: error.message };
          return { deleted: objectId };
        },
      }),
      generateIdeas: tool({
        description: "Create multiple sticky notes in ONE call (fast). Use for ANY request to add 2+ sticky notes: e.g. 'add 3 stickies about X', 'add sticky notes for ideas', 'brainstorm Y'. Creates 1-8 color-coded notes in a frame with spacing. Do NOT use createStickyNote multiple times — use this once with topic and ideas array.",
        inputSchema: z.object({
          topic: z.string().describe("The topic or title for the frame"),
          ideas: z.array(z.string()).describe("Array of 1-8 idea texts (one per sticky); every item must have visible text"),
        }),
        execute: async ({ topic, ideas }) => {
          const colors = ["#FFEB3B", "#FF9800", "#F48FB1", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#E8F5E9"];
          // Ensure every sticky has non-empty text so nothing is hidden or blank
          const safeIdeas = ideas
            .map((t, i) => (typeof t === "string" && t.trim() ? t.trim() : `Idea ${i + 1}`))
            .filter(Boolean);
          const count = Math.max(1, Math.min(8, safeIdeas.length));
          const list = safeIdeas.slice(0, count);
          // Single column for 3 or fewer so stickies stack with clear vertical gaps; otherwise 2 cols
          const cols = list.length <= 3 ? 1 : Math.min(2, list.length);
          const rows = Math.ceil(list.length / cols);
          const pad = 24;
          const gap = 20;
          const cellW = 220;
          const cellH = 200;
          const stickyW = cellW - 8;
          const stickyH = cellH - gap;
          const gridW = cols * cellW + pad * 2;
          const gridH = rows * (stickyH + gap) + pad * 2 + 32 - gap;
          const start = await computeSuggestedPlacement(gridW, gridH);

          const { data: frameData } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "frame",
              x: start.x,
              y: start.y,
              width: gridW,
              height: gridH,
              color: "#6366F1",
              text: topic,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          const frameId = (frameData as { id: string } | null)?.id;

          const created: string[] = [];
          if (frameId) created.push(frameId);
          const stickies = list.map((text, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = start.x + pad + col * cellW;
            const y = start.y + pad + 32 + row * (stickyH + gap);
            const bg = colors[i % colors.length];
            return {
              board_id: boardId,
              type: "sticky_note" as const,
              x,
              y,
              width: stickyW,
              height: stickyH,
              color: bg,
              text,
              properties: { textColor: contrastTextColor(bg), textAlign: "left", frameId },
              created_by: userId,
            };
          });
          const { data: stickyRows, error } = await supabase
            .from("board_elements")
            .insert(stickies as never)
            .select("id");
          if (!error && stickyRows) {
            for (const row of stickyRows as { id: string }[]) created.push(row.id);
          }
          return { created, count: created.length };
        },
      }),
      createBulkStickyNotes: tool({
        description: "Create 50 to 500+ sticky notes in one go. Use when the user asks for '500 objects', '100 stickies', 'create 200 notes', '500+ objects', or any bulk creation (50–500). Each note gets a short fun fact or label. Insert in batches; returns total created. Required for the hard requirement: board must support 500+ objects in one go.",
        inputSchema: z.object({
          count: z.number().min(50).max(500).describe("Number of sticky notes to create (50–500)"),
          theme: z.enum(["fun_facts", "ideas", "numbered"]).describe("Content theme for each note").optional(),
        }),
        execute: async ({ count, theme }) => {
          const colors = ["#FFEB3B", "#FF9800", "#F48FB1", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#E8F5E9"];
          const facts = [
            "The speed of light is 299,792,458 m/s",
            "Honey never spoils",
            "Octopuses have three hearts",
            "A day on Venus is longer than a year",
            "Bananas are berries but strawberries aren't",
            "Water can boil and freeze at the same time",
            "The Eiffel Tower grows 6 inches in summer",
            "A group of flamingos is called a flamboyance",
            "Humans share 60% of DNA with bananas",
            "The moon has moonquakes",
            "Sharks are older than trees",
            "A jiffy is an actual unit of time",
            "Wombat poop is cube-shaped",
            "Hot water can freeze faster than cold",
            "A cloud can weigh over a million pounds",
            "Cows have best friends",
            "Sea otters hold hands while sleeping",
            "The human nose can detect over 1 trillion scents",
            "Polar bears have black skin",
            "A strawberry isn't a berry — it's an aggregate fruit",
          ];
          const safeCount = Math.max(50, Math.min(500, Math.floor(count)));
          const cols = Math.ceil(Math.sqrt(safeCount));
          const gap = 16;
          const cellW = 200;
          const cellH = 180;
          const batchSize = 50;
          let totalCreated = 0;
          const start = await computeSuggestedPlacement(cellW * Math.min(cols, batchSize), cellH * Math.ceil(batchSize / cols));

          for (let batchStart = 0; batchStart < safeCount; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize, safeCount);
            const stickies: Record<string, unknown>[] = [];
            for (let i = batchStart; i < batchEnd; i++) {
              const col = i % cols;
              const row = Math.floor(i / cols);
              const x = start.x + (col * (cellW + gap));
              const y = start.y + (row * (cellH + gap));
              const bg = colors[i % colors.length];
              const text =
                theme === "numbered"
                  ? `#${i + 1}`
                  : theme === "ideas"
                    ? `Idea ${i + 1}`
                    : facts[i % facts.length];
              stickies.push({
                board_id: boardId,
                type: "sticky_note",
                x,
                y,
                width: cellW,
                height: cellH,
                color: bg,
                text: `#${i + 1}: ${text}`,
                properties: { textColor: contrastTextColor(bg), textAlign: "left" },
                created_by: userId,
              });
            }
            const { data: inserted, error } = await supabase
              .from("board_elements")
              .insert(stickies as never)
              .select("id");
            if (error) return { error: error.message, created: totalCreated };
            totalCreated += (inserted?.length ?? 0);
          }
          return { created: totalCreated };
        },
      }),
      createTextElement: tool({
        description: "Create a text label element on the board. Useful for titles, headers, or annotations.",
        inputSchema: z.object({
          text: z.string().describe("Text content"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          color: z.string().describe("Hex color for the text box").optional(),
        }),
        execute: async ({ text, x, y, color }) => {
          const bg = color ?? "#3B82F6";
          const w = Math.max(180, text.length * 9);
          const h = 40;
          let posX = x, posY = y;
          if (await hasOverlap(posX, posY, w, h)) {
            const safe = await computeSuggestedPlacement(w, h);
            posX = safe.x;
            posY = safe.y;
          }
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "text",
              x: posX,
              y: posY,
              width: w,
              height: h,
              color: bg,
              text,
              properties: { textColor: contrastTextColor(bg) },
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createFrame: tool({
        description: "Create a frame (grouping area) on the board. Frames are labeled containers used to organize sections, e.g. 'Sprint Planning', 'SWOT Analysis'. Use when the user asks for a frame, section, area, quadrant, or grouping.",
        inputSchema: z.object({
          title: z.string().describe("Title/label of the frame"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          width: z.number().describe("Width in board units").optional(),
          height: z.number().describe("Height in board units").optional(),
          color: z.string().describe("Hex color for the frame border").optional(),
        }),
        execute: async ({ title, x, y, width, height, color }) => {
          const w = width ?? 400;
          const h = height ?? 300;
          let posX = x, posY = y;
          if (await hasOverlap(posX, posY, w, h)) {
            const safe = await computeSuggestedPlacement(w, h);
            posX = safe.x;
            posY = safe.y;
          }
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "frame",
              x: posX,
              y: posY,
              width: w,
              height: h,
              color: color ?? "#6366F1",
              text: title,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createTemplate: tool({
        description: `Create a structured board template in a SINGLE call. Use this for any complex layout command:
- "Create a SWOT analysis" → template: "swot"
- "Set up a retrospective board with What Went Well, What Didn't, and Action Items columns" → template: "retrospective"
- "Build a user journey map with 5 stages" → template: "user_journey", columns: ["Awareness","Consideration","Purchase","Retention","Advocacy"]
- "Create a 2x3 grid of sticky notes for pros and cons" → template: "grid", columns: ["Pros","Cons"], rows: 3
- "Create a kanban board" → template: "kanban"
- "Create a pros and cons list" → template: "grid", columns: ["Pros","Cons"], rows: 3
This creates frames and stickies with proper spacing in one go. ALWAYS prefer this over multiple createFrame/createStickyNote calls for structured layouts.`,
        inputSchema: z.object({
          template: z.enum(["swot", "retrospective", "kanban", "user_journey", "grid"]).describe("Template type"),
          title: z.string().describe("Board title displayed above the layout").optional(),
          columns: z.array(z.string()).describe("Column labels (for grid/user_journey/custom)").optional(),
          rows: z.number().describe("Number of rows per column (for grid)").optional(),
        }),
        execute: async ({ template, title, columns, rows }) => {
          const created: string[] = [];
          const start = await computeSuggestedPlacement(1200, 800);
          const baseX = start.x;
          const baseY = start.y;

          const frameColor = "#6366F1";
          const colGap = 20;
          const titleH = 40;
          const stickyW = 200;
          const stickyH = 160;
          const stickyPad = 16;
          const stickyGapY = 12;

          let colLabels: string[];
          let rowCount: number;
          let templateTitle: string;

          switch (template) {
            case "swot":
              colLabels = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
              rowCount = 2;
              templateTitle = title ?? "SWOT Analysis";
              break;
            case "retrospective":
              colLabels = columns ?? ["What Went Well", "What Didn't Go Well", "Action Items"];
              rowCount = rows ?? 3;
              templateTitle = title ?? "Retrospective Board";
              break;
            case "kanban":
              colLabels = columns ?? ["To Do", "In Progress", "Done"];
              rowCount = rows ?? 3;
              templateTitle = title ?? "Kanban Board";
              break;
            case "user_journey":
              colLabels = columns ?? ["Awareness", "Consideration", "Purchase", "Retention", "Advocacy"];
              rowCount = rows ?? 2;
              templateTitle = title ?? "User Journey Map";
              break;
            case "grid":
              colLabels = columns ?? ["Column 1", "Column 2"];
              rowCount = rows ?? 3;
              templateTitle = title ?? "Grid";
              break;
            default:
              colLabels = columns ?? ["Column 1", "Column 2"];
              rowCount = 2;
              templateTitle = title ?? "Board";
          }

          const colW = stickyW + stickyPad * 2;
          const colH = titleH + (stickyH + stickyGapY) * rowCount + stickyPad;
          const totalW = colLabels.length * colW + (colLabels.length - 1) * colGap + colGap * 2;
          const totalH = colH + 60;

          // Outer frame
          const { data: outerFrame } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "frame",
              x: baseX,
              y: baseY,
              width: totalW,
              height: totalH,
              color: frameColor,
              text: templateTitle,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          const outerFrameId = (outerFrame as { id: string } | null)?.id;
          if (outerFrameId) created.push(outerFrameId);

          const colColors = ["#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#3B82F6", "#EC4899", "#14B8A6", "#F97316"];
          const stickyColors = [
            ["#A5D6A7", "#81C784", "#66BB6A"],
            ["#FFEB3B", "#FFD54F", "#FFC107"],
            ["#F48FB1", "#F06292", "#EC407A"],
            ["#CE93D8", "#BA68C8", "#AB47BC"],
            ["#90CAF9", "#64B5F6", "#42A5F5"],
            ["#F48FB1", "#FF80AB", "#FF4081"],
            ["#80CBC4", "#4DB6AC", "#26A69A"],
            ["#FFAB91", "#FF8A65", "#FF7043"],
          ];

          const defaultStickies: Record<string, string[]> = {
            swot: [
              "Strong brand", "Loyal customers",
              "Limited budget", "Small team",
              "New market", "Partnership options",
              "Competition growing", "Regulation changes",
            ],
            retrospective: [
              "Great teamwork", "Shipped on time", "Good communication",
              "Too many meetings", "Unclear requirements", "Late testing",
              "Automate deploys", "Better sprint planning", "More pair programming",
            ],
            kanban: [
              "Research competitors", "Design mockups", "Write tests",
              "Build API", "Code review", "Deploy staging",
              "Documentation", "User testing", "Launch prep",
            ],
          };

          for (let c = 0; c < colLabels.length; c++) {
            const colX = baseX + colGap + c * (colW + colGap);
            const colY = baseY + 40;

            // Column frame
            const { data: colFrame } = await supabase
              .from("board_elements")
              .insert({
                board_id: boardId,
                type: "frame",
                x: colX,
                y: colY,
                width: colW,
                height: colH,
                color: colColors[c % colColors.length],
                text: colLabels[c],
                properties: outerFrameId ? { frameId: outerFrameId } : {},
                created_by: userId,
              } as never)
              .select("id")
              .single();
            const colFrameId = (colFrame as { id: string } | null)?.id;
            if (colFrameId) created.push(colFrameId);

            const defaults = defaultStickies[template] ?? [];
            for (let r = 0; r < rowCount; r++) {
              const sx = colX + stickyPad;
              const sy = colY + titleH + r * (stickyH + stickyGapY);
              const idx = c * rowCount + r;
              const bg = (stickyColors[c % stickyColors.length] ?? stickyColors[0])[r % 3];
              const text = defaults[idx] ?? "";
              const { data: stickyData } = await supabase
                .from("board_elements")
                .insert({
                  board_id: boardId,
                  type: "sticky_note",
                  x: sx,
                  y: sy,
                  width: stickyW,
                  height: stickyH,
                  color: bg,
                  text,
                  properties: { textColor: contrastTextColor(bg), textAlign: "left", ...(colFrameId ? { frameId: colFrameId } : {}) },
                  created_by: userId,
                } as never)
                .select("id")
                .single();
              const stickyId = (stickyData as unknown as { id: string } | null)?.id;
              if (stickyId) created.push(stickyId);
            }
          }

          return { created, count: created.length, template: templateTitle };
        },
      }),
      organizeBoard: tool({
        description: "Rearrange all elements on the board into a neat grid layout. Use when user asks to organize, tidy up, or arrange the board.",
        inputSchema: z.object({
          columns: z.number().describe("Number of columns in the grid").optional(),
        }),
        execute: async ({ columns }) => {
          const { data } = await supabase
            .from("board_elements")
            .select("id, type, width, height")
            .eq("board_id", boardId)
            .neq("type", "connector")
            .order("created_at", { ascending: true });
          if (!data || data.length === 0) return { organized: 0 };
          const items = data as { id: string; type: string; width: number; height: number }[];
          const cols = columns ?? Math.ceil(Math.sqrt(items.length));
          const gap = 30;
          let moved = 0;
          for (let i = 0; i < items.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = 50 + col * (220 + gap);
            const y = 50 + row * (220 + gap);
            const { error } = await supabase
              .from("board_elements")
              .update({ x, y } as never)
              .eq("id", items[i].id);
            if (!error) moved++;
          }
          return { organized: moved };
        },
      }),
    },
  });

  return result.toTextStreamResponse();
}
