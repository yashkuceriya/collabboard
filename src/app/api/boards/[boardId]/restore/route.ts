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

/** POST: Restore board to a snapshot. Replaces all current elements with snapshot contents. */
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
  const { snapshotId } = body as { snapshotId?: string };
  if (!snapshotId) return NextResponse.json({ error: "snapshotId required" }, { status: 400 });

  const { data: snapshotRow, error: fetchError } = await supabase
    .from("board_version_snapshots")
    .select("id, board_id, snapshot")
    .eq("id", snapshotId)
    .eq("board_id", boardId)
    .single();

  if (fetchError || !snapshotRow) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const snapshot = snapshotRow.snapshot as Record<string, unknown>[];
  if (!Array.isArray(snapshot)) {
    return NextResponse.json({ error: "Invalid snapshot" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("board_elements")
    .delete()
    .eq("board_id", boardId);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  if (snapshot.length > 0) {
    const rows = snapshot.map((row) => {
      const { id, board_id, type, x, y, width, height, color, text, properties, created_by, created_at, updated_at } = row as Record<string, unknown>;
      return {
        id,
        board_id: board_id ?? boardId,
        type,
        x,
        y,
        width,
        height,
        color,
        text,
        properties,
        created_by,
        created_at,
        updated_at,
      };
    });
    const { error: insertError } = await supabase.from("board_elements").insert(rows as never);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
