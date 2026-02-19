import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/types/database";

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

  // Helper: compute a position (x,y) that does not overlap existing non-connector elements. Used for smarter layout.
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
    const gap = 30;
    const padding = 50;
    if (elements.length === 0) return { x: padding, y: padding };
    const maxRight = Math.max(...elements.map((el) => el.x + el.width));
    const maxBottom = Math.max(...elements.map((el) => el.y + el.height));
    // Place to the right of rightmost if there's room, else below lowest
    const placeRight = maxRight + gap + width <= 1400;
    if (placeRight) return { x: maxRight + gap, y: padding };
    return { x: padding, y: maxBottom + gap };
  }

  // Convert UIMessage[] (parts-based) to ModelMessage[] (content-based) for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are an AI assistant for a collaborative whiteboard called CollabBoard. You ONLY help with this whiteboard: creating and editing elements, connecting shapes, brainstorming, organizing, and summarizing board content.
${interviewMode ? `
INTERVIEW MODE IS ACTIVE. The user is practicing for a technical interview (system design or coding). Help them think through problems step by step. When they ask for help:
- Break down the problem into components
- Suggest what to draw on the whiteboard (boxes for services, arrows for data flow)
- Ask clarifying questions like an interviewer would
- Point out things they might be missing (scalability, edge cases, trade-offs)
- Help analyze time/space complexity for algorithm problems
- Be encouraging but thorough
` : ""}

Guardrails (strict):
- Only answer requests that are clearly about the board: add/move/edit/delete elements, connect two shapes, brainstorm ideas, summarize or organize the board. If the user asks about anything else (weather, general knowledge, code, poems, other topics), do not call any tools; reply with one short decline. Example: "I can only help with your CollabBoard — things like adding stickies, connecting shapes, or summarizing the board. Try asking 'add a sticky note' or 'connect the idea to the goal'."
- Do not make up or assume element IDs. Always use getBoardState first when you need to find an element by name or description, then use the exact id from the response for moveObject, updateText, changeColor, resizeObject, deleteObject, or createConnector.
- When any tool returns an error, tell the user in plain language (e.g. "That element wasn't found on the board." or "I couldn't connect those; one of the shapes might have been deleted."). Do not ignore tool errors.

Reply in plain text only: no markdown, no asterisks, no code blocks, no backticks. Write like a short, friendly message (e.g. "Done. I added 3 sticky notes: Ideas, Goals, and Blockers."). Do not use ** or * for emphasis, or \` for code.

Capabilities:
- Create sticky notes, shapes (rectangle/circle), and text elements
- Create connectors (arrows) between two shapes using createConnector(fromId, toId) — use getBoardState to get element ids
- Move, resize, recolor, and delete existing elements
- Read the current board state to understand context
- getSuggestedPlacement: call before createStickyNote, createShape, or createTextElement to get an (x, y) that does not overlap existing elements. Prefer this so new items do not cover the board.
- Generate ideas: when asked to brainstorm, use generateIdeas; it places the grid without overlapping existing content
- Summarize: read all elements and provide a concise summary. When the user asks to summarize, also put the summary on the board by calling getSuggestedPlacement then createStickyNote with the summary text (e.g. "Summary: …" or "Board summary: …") so a Summary sticky appears.
- Organize: rearrange elements into a neat grid or grouped layout

Guidelines:
- Coordinates are in board units. The visible area is roughly 0-1200 x 0-800.
- To avoid overlapping: for a single new sticky/shape/text, call getSuggestedPlacement first and use the returned (x, y). For multiple items use generateIdeas (it already avoids overlap) or getBoardState and place in empty space.
- Use varied colors for sticky notes to make the board visually appealing.
- Keep text responses brief and helpful. After using tools, confirm what you did in plain language.
- For brainstorming, create 4-8 sticky notes with distinct ideas using generateIdeas.
- When summarizing the board, always create a sticky note with the summary text so the user sees it on the board; then briefly confirm in your reply.
- Default sticky note colors: #FFEB3B (yellow), #FF9800 (orange), #F48FB1 (pink), #CE93D8 (purple), #90CAF9 (blue), #80CBC4 (teal), #A5D6A7 (green).`,
    messages: modelMessages,
    stopWhen: stepCountIs(5),
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
        description: "Create a sticky note on the board. text: content of the note. x, y: position. color: hex e.g. #FFEB3B for yellow.",
        inputSchema: z.object({
          text: z.string().describe("Text content of the sticky note"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          color: z.string().describe("Hex color e.g. #FFEB3B").optional(),
        }),
        execute: async ({ text, x, y, color }) => {
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "sticky_note",
              x,
              y,
              width: 200,
              height: 200,
              color: color ?? "#FFEB3B",
              text: text ?? "New note",
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createShape: tool({
        description: "Create a rectangle or circle. shapeType: 'rectangle' or 'circle'. x, y, width, height in board units. color: hex.",
        inputSchema: z.object({
          shapeType: z.enum(["rectangle", "circle"]).describe("rectangle or circle"),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          width: z.number().describe("Width in board units").optional(),
          height: z.number().describe("Height in board units").optional(),
          color: z.string().describe("Hex color").optional(),
        }),
        execute: async ({ shapeType, x, y, width, height, color }) => {
          const w = width ?? 150;
          const h = height ?? 100;
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: shapeType,
              x,
              y,
              width: w,
              height: h,
              color: color ?? "#42A5F5",
              text: "",
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
        },
      }),
      createConnector: tool({
        description: "Create an arrow (connector) between two shapes. Use getBoardState first to get the exact element ids. fromId and toId must be ids of non-connector elements (sticky_note, rectangle, circle, text) on this board. Use when the user asks to connect two shapes, draw an arrow between A and B, or link two elements.",
        inputSchema: z.object({
          fromId: z.string().uuid().describe("UUID of the source element (from getBoardState)"),
          toId: z.string().uuid().describe("UUID of the target element (from getBoardState)"),
        }),
        execute: async ({ fromId, toId }) => {
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
              color: "#64748b",
              text: "",
              properties: { fromId, toId },
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
          const { error } = await supabase
            .from("board_elements")
            .update({ color } as never)
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
        description: "Generate multiple sticky notes with brainstormed ideas on a topic. Creates 4-8 color-coded notes arranged in a grid. Places the grid so it does not overlap existing elements. Use when the user asks to brainstorm, generate ideas, or wants suggestions.",
        inputSchema: z.object({
          topic: z.string().describe("The topic to brainstorm about"),
          ideas: z.array(z.string()).describe("Array of idea texts, 4-8 items"),
        }),
        execute: async ({ ideas }) => {
          const start = await computeSuggestedPlacement(200, 200);
          const colors = ["#FFEB3B", "#FF9800", "#F48FB1", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#FFFFFF"];
          const cols = Math.min(4, ideas.length);
          const created: string[] = [];
          for (let i = 0; i < ideas.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = start.x + col * 220;
            const y = start.y + row * 220;
            const { data, error } = await supabase
              .from("board_elements")
              .insert({
                board_id: boardId,
                type: "sticky_note",
                x,
                y,
                width: 200,
                height: 200,
                color: colors[i % colors.length],
                text: ideas[i],
                created_by: userId,
              } as never)
              .select("id")
              .single();
            if (!error && data) created.push((data as { id: string }).id);
          }
          return { created, count: created.length };
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
          const { data, error } = await supabase
            .from("board_elements")
            .insert({
              board_id: boardId,
              type: "text",
              x,
              y,
              width: Math.max(180, text.length * 9),
              height: 40,
              color: color ?? "#3B82F6",
              text,
              created_by: userId,
            } as never)
            .select("id")
            .single();
          if (error) return { error: error.message };
          return { created: (data as { id: string } | null)?.id };
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
