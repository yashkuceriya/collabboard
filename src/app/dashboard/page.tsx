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
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">My Boards</h2>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">{boards.length} board{boards.length !== 1 ? "s" : ""}</p>
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
                <button
                  key={board.id}
                  onClick={() => router.push(`/board/${board.id}`)}
                  className="group bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800/60 rounded-xl overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className={`h-2 w-full bg-gradient-to-r ${grad}`} />
                  <div className="p-5">
                    <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center mb-3 shadow-sm`}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
                        <rect x="2" y="2" width="12" height="12" rx="2" />
                        <path d="M6 5h4M5 8h6M6 11h4" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{board.name}</h3>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                      {new Date(board.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
