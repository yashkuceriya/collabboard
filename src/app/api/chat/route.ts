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
  const { messages, boardId, userId, accessToken } = (await req.json()) as {
    messages: UIMessage[];
    boardId: string;
    userId: string;
    accessToken: string | null;
  };

  if (!boardId || !userId) {
    return new Response(JSON.stringify({ error: "boardId and userId required" }), { status: 400 });
  }

  const supabase = getSupabase(accessToken);

  // Convert UIMessage[] (parts-based) to ModelMessage[] (content-based) for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: `You are an AI assistant for a collaborative whiteboard called CollabBoard. You help users brainstorm, organize, and build visual boards.

Capabilities:
- Create sticky notes, shapes (rectangle/circle), and text elements
- Move, resize, recolor, and delete existing elements
- Read the current board state to understand context
- Generate ideas: when asked to brainstorm, create multiple color-coded sticky notes arranged in a grid
- Summarize: read all elements and provide a concise summary of the board's content
- Organize: rearrange elements into a neat grid or grouped layout

Guidelines:
- Coordinates are in board units. The visible area is roughly 0-1200 x 0-800.
- When generating multiple items, space them out in rows (e.g. x increments of 220, y increments of 220).
- Use varied colors for sticky notes to make the board visually appealing.
- Keep text responses brief and helpful. After using tools, confirm what you did.
- For brainstorming, create 4-8 sticky notes with distinct ideas.
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
      moveObject: tool({
        description: "Move an element by id to a new position (x, y).",
        inputSchema: z.object({
          objectId: z.string().describe("UUID of the element"),
          x: z.number().describe("New X position"),
          y: z.number().describe("New Y position"),
        }),
        execute: async ({ objectId, x, y }) => {
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
          const { error } = await supabase.from("board_elements").delete().eq("id", objectId);
          if (error) return { error: error.message };
          return { deleted: objectId };
        },
      }),
      generateIdeas: tool({
        description: "Generate multiple sticky notes with brainstormed ideas on a topic. Creates 4-8 color-coded notes arranged in a grid. Use this when the user asks to brainstorm, generate ideas, or wants suggestions.",
        inputSchema: z.object({
          topic: z.string().describe("The topic to brainstorm about"),
          ideas: z.array(z.string()).describe("Array of idea texts, 4-8 items"),
        }),
        execute: async ({ ideas }) => {
          const colors = ["#FFEB3B", "#FF9800", "#F48FB1", "#CE93D8", "#90CAF9", "#80CBC4", "#A5D6A7", "#FFFFFF"];
          const cols = Math.min(4, ideas.length);
          const created: string[] = [];
          for (let i = 0; i < ideas.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const { data, error } = await supabase
              .from("board_elements")
              .insert({
                board_id: boardId,
                type: "sticky_note",
                x: 50 + col * 220,
                y: 50 + row * 220,
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
