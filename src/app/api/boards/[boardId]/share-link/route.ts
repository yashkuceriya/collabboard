import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const _supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
void _supabaseServiceKey; // reserved for future admin use

export async function POST(
  req: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { role = "editor", accessToken } = body as { role?: "editor" | "viewer"; accessToken?: string };

  const anon = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: boardRow } = await anon.from("boards").select("owner_id").eq("id", boardId).single();
  const board = boardRow as { owner_id: string } | null;
  if (!board || board.owner_id !== user.id) return NextResponse.json({ error: "Forbidden: only the board owner can create share links" }, { status: 403 });

  const linkRole = role === "viewer" ? "viewer" : "editor";
  const { data: link, error } = await anon
    .from("board_share_links")
    .insert({
      board_id: boardId,
      role: linkRole,
      created_by: user.id,
    } as never)
    .select("token")
    .single();

  if (error || !link) return NextResponse.json({ error: error?.message || "Failed to create link" }, { status: 500 });
  const token = (link as { token: string }).token;
  const origin = req.headers.get("origin") || req.headers.get("x-forwarded-host") || "http://localhost:3000";
  const base = origin.startsWith("http") ? origin : `https://${origin}`;
  const url = `${base}/board/${boardId}?invite=${token}`;
  return NextResponse.json({ url, token });
}
