import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const authHeader = req.headers.get("authorization");
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: authHeader ? { headers: { Authorization: authHeader } } : undefined,
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: boardRow } = await supabase.from("boards").select("owner_id").eq("id", boardId).single();
  const board = boardRow as { owner_id: string } | null;
  if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
  const isOwner = board.owner_id === user.id;
  const { data: membersData } = await supabase.from("board_members").select("user_id, role").eq("board_id", boardId);
  type MemberRow = { user_id: string; role: "editor" | "viewer" };
  const members: MemberRow[] = (membersData ?? []) as MemberRow[];
  const hasAccess = isOwner || members.some((m) => m.user_id === user.id);
  if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    owner_id: board.owner_id,
    members: members.map((m) => ({ user_id: m.user_id, role: m.role })),
  });
}
