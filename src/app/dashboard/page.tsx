"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Board } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth");
        return;
      }
      setUser(user);

      const { data } = await supabase
        .from("boards")
        .select("*")
        .order("created_at", { ascending: false });

      setBoards(data || []);
      setLoading(false);
    }
    init();
  }, [router]);

  async function createBoard() {
    if (!user) return;
    setCreateError("");
    const { data, error } = await supabase
      .from("boards")
      .insert({ owner_id: user.id, name: "Untitled Board" } as never)
      .select()
      .single();

    if (error) {
      setCreateError("Could not create board. Please try again.");
      return;
    }
    if (data) {
      router.push(`/board/${(data as Board).id}`);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">CollabBoard</h1>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <span className="text-sm text-gray-400 dark:text-gray-500">{user?.email}</span>
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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">My Boards</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{boards.length} board{boards.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={createBoard}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-500/25"
          >
            + New Board
          </button>
        </div>

        {boards.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 border-dashed">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-1 font-medium">No boards yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">Create your first board to get started</p>
            <button
              onClick={createBoard}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-500/25"
            >
              Create Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {boards.map((board) => (
              <button
                key={board.id}
                onClick={() => router.push(`/board/${board.id}`)}
                className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 text-left hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-800 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-500 dark:text-blue-400">
                    <rect x="2" y="2" width="12" height="12" rx="2" />
                    <path d="M6 5h4M5 8h6M6 11h4" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{board.name}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(board.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
