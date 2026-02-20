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
  const { token: inviteToken, accessToken } = body as { token?: string; accessToken?: string };
  if (!inviteToken) return NextResponse.json({ error: "token required" }, { status: 400 });

  const anon = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!supabaseServiceKey) return NextResponse.json({ error: "Server configuration: SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  const admin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: linkRow } = await admin
    .from("board_share_links")
    .select("board_id, role")
    .eq("token", inviteToken)
    .single();
  const link = linkRow as { board_id: string; role: string } | null;
  if (!link || link.board_id !== boardId) return NextResponse.json({ error: "Invalid or expired invite link" }, { status: 404 });

  const { error: insertError } = await admin.from("board_members").insert({
    board_id: boardId,
    user_id: user.id,
    role: link.role === "viewer" ? "viewer" : "editor",
  } as never);
  if (insertError) {
    if (insertError.code === "23505") return NextResponse.json({ ok: true, already_member: true });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
