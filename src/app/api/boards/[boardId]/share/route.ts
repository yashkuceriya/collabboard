import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { email, role = "editor", accessToken } = body as { email?: string; role?: "editor" | "viewer"; accessToken?: string };
  const trimmed = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!trimmed) return NextResponse.json({ error: "email required" }, { status: 400 });

  const anon = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: boardRow } = await anon.from("boards").select("owner_id").eq("id", boardId).single();
  const board = boardRow as { owner_id: string } | null;
  if (!board || board.owner_id !== user.id) return NextResponse.json({ error: "Forbidden: only the board owner can share" }, { status: 403 });

  if (!supabaseServiceKey) return NextResponse.json({ error: "Server configuration: SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  const admin = createClient<Database>(supabaseUrl, supabaseServiceKey);

  const rpcResult = await (admin as unknown as { rpc: (n: string, a: { user_email: string }) => Promise<{ data: string | null; error: unknown }> }).rpc("get_user_id_by_email", { user_email: trimmed });
  const { data: userId, error: rpcError } = rpcResult;
  if (rpcError || !userId) return NextResponse.json({ error: "No user found with that email" }, { status: 404 });

  if (userId === user.id) return NextResponse.json({ error: "You cannot share the board with yourself" }, { status: 400 });

  const { error: insertError } = await admin.from("board_members").insert({
    board_id: boardId,
    user_id: userId,
    role: role === "viewer" ? "viewer" : "editor",
  } as never);
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ error: "Already shared with this user" }, { status: 409 });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, user_id: userId });
}
