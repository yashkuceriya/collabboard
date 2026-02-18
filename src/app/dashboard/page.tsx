"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import type { Board } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";
import { ThemeSwitcher } from "@/components/theme-switcher";

export type BoardWithAccess = Board & { access: "owner" | "shared" };

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<BoardWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  async function fetchMyBoards(userId: string) {
    const ownedRes = await supabase.from("boards").select("*").eq("owner_id", userId).order("created_at", { ascending: false });
    const owned = (ownedRes.data || []) as Board[];
    let shared: Board[] = [];
    const membersRes = await supabase.from("board_members").select("board_id").eq("user_id", userId);
    if (!membersRes.error && membersRes.data?.length) {
      const sharedBoardIds = new Set((membersRes.data || []).map((r: { board_id: string }) => r.board_id));
      const sharedIdsToFetch = [...sharedBoardIds].filter((id) => !owned.some((b) => b.id === id));
      if (sharedIdsToFetch.length > 0) {
        const { data } = await supabase.from("boards").select("*").in("id", sharedIdsToFetch).order("created_at", { ascending: false });
        shared = (data || []) as Board[];
      }
    }
    const withAccess: BoardWithAccess[] = [
      ...owned.map((b) => ({ ...b, access: "owner" as const })),
      ...shared.map((b) => ({ ...b, access: "shared" as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setBoards(withAccess);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      if (cancelled) return;
      setUser(user);
      await fetchMyBoards(user.id);
      if (cancelled) return;
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [router]);

  // Refetch when user returns to dashboard (e.g. after renaming a board on the board page)
  useEffect(() => {
    if (pathname === "/dashboard" && user?.id) fetchMyBoards(user.id);
  }, [pathname, user?.id]);

  // Also refetch when user returns to this browser tab
  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && userId) fetchMyBoards(userId);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [user?.id]);

  async function createBoard() {
    if (!user) return;
    setCreateError("");
    const { data, error } = await supabase
      .from("boards")
      .insert({ owner_id: user.id, name: "Untitled Board" } as never)
      .select()
      .single();

    if (error) {
      console.error("[createBoard]", error);
      const msg = error.message || "Could not create board. Please try again.";
      setCreateError(msg);
      return;
    }
    if (data) {
      router.push(`/board/${(data as Board).id}`);
    }
  }

  async function deleteBoard(id: string) {
    await supabase.from("board_elements").delete().eq("board_id", id);
    await supabase.from("boards").delete().eq("id", id);
    setBoards((prev) => prev.filter((b) => b.id !== id));
    setDeletingBoardId(null);
  }

  async function renameBoard(id: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from("boards").update({ name: trimmed } as never).eq("id", id);
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, name: trimmed } : b)));
    setEditingBoardId(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg animate-pulse">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
      <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">CollabBoard</h1>
        </div>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <span className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {createError && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {createError}
          </div>
        )}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Boards</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {boards.filter((b) => b.access === "owner").length} owned · {boards.filter((b) => b.access === "shared").length} shared with you
            </p>
          </div>
          <button
            onClick={createBoard}
            className="px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-blue-500/25"
          >
            + New Board
          </button>
        </div>

        {boards.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 border-dashed">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500 dark:text-blue-400">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-1 font-semibold text-lg">No boards yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Create your first board to get started</p>
            <button
              onClick={createBoard}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-blue-500/25"
            >
              Create Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {boards.map((board, i) => {
              const gradients = [
                "from-blue-500 to-indigo-500",
                "from-emerald-500 to-teal-500",
                "from-violet-500 to-purple-500",
                "from-orange-500 to-amber-500",
                "from-pink-500 to-rose-500",
                "from-cyan-500 to-blue-500",
              ];
              const grad = gradients[i % gradients.length];
              return (
                <div
                  key={board.id}
                  className="group bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800/60 rounded-xl overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                  onClick={() => {
                    if (editingBoardId !== board.id) router.push(`/board/${board.id}`);
                  }}
                >
                  <div className={`h-2 w-full bg-gradient-to-r ${grad}`} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
                          <rect x="2" y="2" width="12" height="12" rx="2" />
                          <path d="M6 5h4M5 8h6M6 11h4" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        {board.access === "owner" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingBoardId(board.id);
                              setEditName(board.name);
                            }}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
                            title="Rename board"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                              <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                            </svg>
                          </button>
                        )}
                        {board.access === "owner" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingBoardId(board.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-all"
                            title="Delete board"
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-500">
                              <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    {editingBoardId === board.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => renameBoard(board.id, editName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") renameBoard(board.id, editName);
                          if (e.key === "Escape") setEditingBoardId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full font-semibold text-gray-800 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 outline-none pb-0.5"
                      />
                    ) : (
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2">
                        {board.name}
                        {board.access === "shared" && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">Shared</span>
                        )}
                      </h3>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                      {new Date(board.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Delete confirmation dialog */}
      {deletingBoardId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setDeletingBoardId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 max-w-sm mx-4 w-full" onClick={(e) => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-1">Delete board?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">This will permanently delete the board and all its elements. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingBoardId(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteBoard(deletingBoardId)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors shadow-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
