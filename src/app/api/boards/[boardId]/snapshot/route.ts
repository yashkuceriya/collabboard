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

/** GET: List version snapshots for the board (for Version History panel). */
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

  const { data, error } = await supabase
    .from("board_version_snapshots")
    .select("id, created_at, user_id")
    .eq("board_id", boardId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data ?? [] });
}

/** POST: Create a version snapshot of the board (current elements). Called debounced after edits. */
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

  const { data: elements, error: fetchError } = await supabase
    .from("board_elements")
    .select("*")
    .eq("board_id", boardId)
    .order("created_at", { ascending: true });

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const { error: insertError } = await supabase
    .from("board_version_snapshots")
    .insert({
      board_id: boardId,
      user_id: user.id,
      snapshot: elements ?? [],
    } as never);

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
