import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function getSupabase(accessToken: string | null) {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/** GET: Load AI messages for the board from the last 24 hours */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
  const supabase = getSupabase(accessToken);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("board_ai_messages")
    .select("id, role, content, created_at")
    .eq("board_id", boardId)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data ?? [] });
}

/** POST: Append AI messages (user + assistant) after a turn */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "") ?? null;
  const supabase = getSupabase(accessToken);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { messages } = body as { messages?: { role: string; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const rows = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({
      board_id: boardId,
      role: m.role as "user" | "assistant",
      content: String(m.content),
    }));

  const { error: insertError } = await supabase.from("board_ai_messages").insert(rows as never);

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
