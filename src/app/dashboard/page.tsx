"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import type { Board } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { UserMenu } from "@/components/user-menu";
import { BoardPreview } from "@/components/board-preview";
import { ShareBoardModal } from "@/components/share-board-modal";
import { getRecentBoardIds, removeRecentBoard, clearRecentBoards } from "@/lib/recent-boards";

function KanbanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="3" y="15" width="6" height="6" rx="1" />
      <rect x="15" y="15" width="6" height="6" rx="1" />
    </svg>
  );
}
function SWOTIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}
function RetroIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}
function JourneyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
function ProsConsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  );
}

export type BoardWithAccess = Board & { access: "owner" | "shared" };

type TabId = "all" | "starred" | "interview" | "recent";

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [createError, setCreateError] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [leavingBoardId, setLeavingBoardId] = useState<string | null>(null);
  const [shareBoard, setShareBoard] = useState<{ id: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [search, setSearch] = useState("");
  const [, setRecentKey] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("collabboard-view") as "grid" | "list" | null;
      if (stored === "grid" || stored === "list") setViewMode(stored);
    } catch {}
  }, []);
  const setViewModePersisted = useCallback((mode: "grid" | "list") => {
    setViewMode(mode);
    try {
      localStorage.setItem("collabboard-view", mode);
    } catch {}
  }, []);

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
    ].sort((a, b) => {
      if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setBoards(withAccess);
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        router.push("/auth");
        return;
      }
      if (cancelled) return;
      setUser(user);
      setAccessToken(session?.access_token ?? null);
      await fetchMyBoards(user.id);
      if (cancelled) return;
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (pathname === "/dashboard" && user?.id) {
      fetchMyBoards(user.id);
    }
  }, [pathname, user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    function onVisibilityChange() {
      if (document.visibilityState === "visible" && userId) fetchMyBoards(userId);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [user?.id]);

  async function createBoard(isInterview: boolean = false, template?: string) {
    if (!user) return;
    setCreateError("");
    const name = isInterview ? "Untitled Interview Board" : "Untitled Board";
    const { data, error } = await supabase
      .from("boards")
      .insert({ owner_id: user.id, name, is_interview: isInterview } as never)
      .select()
      .single();

    if (error) {
      console.error("[createBoard]", error);
      const msg = error.message || "Could not create board. Please try again.";
      setCreateError(msg);
      return;
    }
    if (data) {
      const id = (data as Board).id;
      const url = template ? `/board/${id}?template=${encodeURIComponent(template)}` : `/board/${id}`;
      router.push(url);
    }
  }

  async function deleteBoard(id: string) {
    await supabase.from("board_elements").delete().eq("board_id", id);
    const { error } = await supabase.from("boards").delete().eq("id", id);
    if (error) {
      alert("Failed to delete board. Please try again.");
      return;
    }
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

  async function toggleStar(id: string) {
    const board = boards.find((b) => b.id === id);
    if (!board) return;
    const newVal = !board.is_starred;
    setBoards((prev) =>
      prev.map((b) => (b.id === id ? { ...b, is_starred: newVal } : b))
        .sort((a, b) => {
          if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
    );
    await supabase.from("boards").update({ is_starred: newVal } as never).eq("id", id);
  }

  async function leaveBoard(id: string) {
    setLeavingBoardId(id);
    try {
      const res = await fetch(`/api/boards/${id}/leave`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to leave board.");
        return;
      }
      setBoards((prev) => prev.filter((b) => b.id !== id));
      removeRecentBoard(id);
      setRecentKey((k) => k + 1);
    } finally {
      setLeavingBoardId(null);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  const recentEntries = getRecentBoardIds();
  const recentMap = new Map(recentEntries.map((e) => [e.boardId, e.openedAt]));

  const handleRemoveFromRecent = (boardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeRecentBoard(boardId);
    setRecentKey((k) => k + 1);
  };
  const handleClearRecent = () => {
    clearRecentBoards();
    setRecentKey((k) => k + 1);
  };

  const filteredBoards = boards.filter((b) => {
    const matchesTab =
      activeTab === "all" ||
      (activeTab === "starred" && b.is_starred) ||
      (activeTab === "interview" && b.is_interview) ||
      (activeTab === "recent" && recentMap.has(b.id));
    const matchesSearch = !search.trim() || b.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const sortedBoards =
    activeTab === "recent"
      ? [...filteredBoards].sort((a, b) => (recentMap.get(b.id) ?? 0) - (recentMap.get(a.id) ?? 0))
      : filteredBoards;

  const ownedCount = boards.filter((b) => b.access === "owner").length;
  const sharedCount = boards.filter((b) => b.access === "shared").length;
  const starredCount = boards.filter((b) => b.is_starred).length;
  const interviewCount = boards.filter((b) => b.is_interview).length;
  const recentCount = boards.filter((b) => recentMap.has(b.id)).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
        <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
          </div>
          <div className="h-8 w-24 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-7 w-32 rounded bg-gray-200 dark:bg-gray-800 animate-pulse mb-2" />
              <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
            </div>
            <div className="h-9 w-28 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800/60 rounded-xl overflow-hidden">
                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
                <div className="h-28 bg-gray-100 dark:bg-gray-800/50 animate-pulse" />
                <div className="p-4 space-y-3">
                  <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
      <header className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-800/50 px-6 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-lg -m-1 p-1 hover:bg-gray-100/80 dark:hover:bg-gray-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shadow-blue-500/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">CollabBoard</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeSwitcher />
          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
          <UserMenu user={user} onSignOut={handleSignOut} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        {createError && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
            {createError}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Boards</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
              {ownedCount} owned · {sharedCount} shared with you
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => createBoard(false)}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 active:scale-[0.98] text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
            >
              + New Board
            </button>
            <button
              onClick={() => createBoard(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-[0.98] text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-500/25 hover:shadow-lg hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
            >
              + Interview Board
            </button>
          </div>
        </div>

        {/* Templates */}
        <section className="mb-10" aria-label="Start from a template">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">Start from a template</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { id: "kanban", label: "Kanban", desc: "To Do, In Progress, Done", Icon: KanbanIcon },
              { id: "swot", label: "SWOT", desc: "Strengths, Weaknesses, …", Icon: SWOTIcon },
              { id: "retrospective", label: "Retrospective", desc: "What went well, what to improve", Icon: RetroIcon },
              { id: "user_journey", label: "User Journey", desc: "Map the user experience flow", Icon: JourneyIcon },
              { id: "pros_cons", label: "Pros & Cons", desc: "Weigh options side by side", Icon: ProsConsIcon },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => createBoard(false, t.id)}
                className="group text-left p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900"
              >
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3">
                  <t.Icon className="w-5 h-5" />
                </span>
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 block">{t.label}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{t.desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1.5 min-h-[42px]">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === "all" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              All Boards
            </button>
            <button
              onClick={() => setActiveTab("starred")}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "starred" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={activeTab === "starred" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Starred{starredCount > 0 && ` (${starredCount})`}
            </button>
            <button
              onClick={() => setActiveTab("interview")}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "interview" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
              Interview{interviewCount > 0 && ` (${interviewCount})`}
            </button>
            <button
              onClick={() => setActiveTab("recent")}
              className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 ${activeTab === "recent" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Recent{recentCount > 0 && ` (${recentCount})`}
            </button>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-0.5">
              <button
                type="button"
                onClick={() => setViewModePersisted("grid")}
                title="Grid view"
                className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setViewModePersisted("list")}
                title="List view"
                className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </button>
            </div>
            {activeTab === "recent" && recentCount > 0 && (
              <button
                type="button"
                onClick={handleClearRecent}
                className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 hover:underline"
              >
                Clear recent
              </button>
            )}
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" aria-hidden />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boards..."
                aria-label="Search boards"
                className="pl-9 pr-3 py-2.5 w-56 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
              />
            </div>
          </div>
        </div>

        {sortedBoards.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-800/60 border-dashed">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 ${activeTab === "interview" ? "bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30" : activeTab === "recent" ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30" : "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30"}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={activeTab === "interview" ? "text-emerald-500 dark:text-emerald-400" : activeTab === "recent" ? "text-amber-500 dark:text-amber-400" : "text-blue-500 dark:text-blue-400"}>
                {activeTab === "starred" ? (
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                ) : activeTab === "interview" ? (
                  <>
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </>
                ) : activeTab === "recent" ? (
                  <>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </>
                ) : (
                  <>
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M12 8v8M8 12h8" />
                  </>
                )}
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-1 font-semibold text-lg">
              {activeTab === "starred" ? "No starred boards" : activeTab === "interview" ? "No interview boards" : activeTab === "recent" ? "No recent boards" : search ? "No matching boards" : "No boards yet"}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">
              {activeTab === "starred" ? "Star a board to see it here" : activeTab === "interview" ? "Create an interview board from the button above" : activeTab === "recent" ? "Open a board to see it here" : search ? "Try a different search term" : "Create your first board to get started"}
            </p>
            {activeTab === "all" && !search && (
              <button
                onClick={() => createBoard(false)}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-blue-500/25"
              >
                Create Board
              </button>
            )}
            {activeTab === "interview" && !search && (
              <button
                onClick={() => createBoard(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm shadow-emerald-500/25"
              >
                + Interview Board
              </button>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="flex flex-col gap-2">
            {sortedBoards.map((board) => {
              const gradients = [
                "from-blue-500 to-indigo-500",
                "from-emerald-500 to-teal-500",
                "from-violet-500 to-purple-500",
                "from-orange-500 to-amber-500",
                "from-pink-500 to-rose-500",
                "from-cyan-500 to-blue-500",
              ];
              let hash = 0;
              for (let j = 0; j < board.id.length; j++) hash = ((hash << 5) - hash + board.id.charCodeAt(j)) | 0;
              const grad = gradients[Math.abs(hash) % gradients.length];
              return (
                <div
                  key={board.id}
                  className="group flex items-stretch gap-4 bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800/60 rounded-xl overflow-hidden text-left shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer"
                  onClick={() => {
                    if (editingBoardId !== board.id) router.push(`/board/${board.id}`);
                  }}
                >
                  <div className={`w-28 sm:w-32 shrink-0 h-20 sm:h-24 bg-gray-100 dark:bg-gray-800 overflow-hidden border-r border-gray-200/60 dark:border-gray-800/60`}>
                    <div className={`h-1 w-full bg-gradient-to-r ${grad}`} />
                    <div className="h-full w-full [&>div]:!rounded-none">
                      <BoardPreview boardId={board.id} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 py-3 pr-4 flex flex-col justify-center">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className={`w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center`}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
                          <rect x="2" y="2" width="12" height="12" rx="2" />
                          <path d="M6 5h4M5 8h6M6 11h4" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleStar(board.id); }} className={`p-1.5 rounded-lg transition-all ${board.is_starred ? "text-amber-400" : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400"}`} title={board.is_starred ? "Unstar" : "Star"}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={board.is_starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                        </button>
                        {board.access === "owner" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShareBoard({ id: board.id, name: board.name }); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100" title="Share"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg></button>
                        )}
                        {board.access === "owner" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingBoardId(board.id); setEditName(board.name); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100" title="Rename"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" /></svg></button>
                        )}
                        {board.access === "owner" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingBoardId(board.id); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 opacity-0 group-hover:opacity-100" title="Delete"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 hover:text-red-500"><path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" /></svg></button>
                        )}
                        {board.access === "shared" && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); if (leavingBoardId === board.id) return; if (confirm("Remove this board from your list?")) leaveBoard(board.id); }} disabled={leavingBoardId === board.id} className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 opacity-0 group-hover:opacity-100" title="Leave"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 hover:text-amber-500"><path d="M6 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V3a1 1 0 00-1-1h-2M6 2v2a1 1 0 001 1h2a1 1 0 001-1V2M6 2h4" /></svg></button>
                        )}
                        {activeTab === "recent" && (
                          <button type="button" onClick={(e) => handleRemoveFromRecent(board.id, e)} className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 opacity-0 group-hover:opacity-100" title="Remove from recent"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 hover:text-amber-500"><path d="M12 4L4 12M4 4l8 8" /></svg></button>
                        )}
                      </div>
                    </div>
                    {editingBoardId === board.id ? (
                      <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onBlur={() => renameBoard(board.id, editName)} onKeyDown={(e) => { if (e.key === "Enter") renameBoard(board.id, editName); if (e.key === "Escape") setEditingBoardId(null); }} onClick={(e) => e.stopPropagation()} className="w-full font-semibold text-gray-800 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 outline-none pb-0.5" />
                    ) : (
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate flex items-center gap-2 flex-wrap">
                        <span className="truncate min-w-0">{board.name}</span>
                        {board.is_interview && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">Interview</span>}
                        {board.access === "shared" && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">Shared</span>}
                      </h3>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(board.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {sortedBoards.map((board) => {
              const gradients = [
                "from-blue-500 to-indigo-500",
                "from-emerald-500 to-teal-500",
                "from-violet-500 to-purple-500",
                "from-orange-500 to-amber-500",
                "from-pink-500 to-rose-500",
                "from-cyan-500 to-blue-500",
              ];
              let hash = 0;
              for (let j = 0; j < board.id.length; j++) hash = ((hash << 5) - hash + board.id.charCodeAt(j)) | 0;
              const grad = gradients[Math.abs(hash) % gradients.length];
              return (
                <div
                  key={board.id}
                  className="group bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-800/60 rounded-xl overflow-hidden text-left shadow-sm hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50 hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 cursor-pointer"
                  onClick={() => {
                    if (editingBoardId !== board.id) router.push(`/board/${board.id}`);
                  }}
                >
                  <div className={`h-2 w-full bg-gradient-to-r ${grad}`} />
                  <BoardPreview boardId={board.id} />
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.5">
                          <rect x="2" y="2" width="12" height="12" rx="2" />
                          <path d="M6 5h4M5 8h6M6 11h4" />
                        </svg>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {/* Star toggle — always visible if starred, otherwise on hover */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(board.id);
                          }}
                          className={`p-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ${board.is_starred ? "text-amber-400 hover:text-amber-500" : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-amber-400"}`}
                          title={board.is_starred ? "Unstar" : "Star"}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill={board.is_starred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                          {board.access === "owner" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShareBoard({ id: board.id, name: board.name });
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
                              title="Share board"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                                <polyline points="16 6 12 2 8 6" />
                                <line x1="12" y1="2" x2="12" y2="15" />
                              </svg>
                            </button>
                          )}
                          {board.access === "owner" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingBoardId(board.id);
                                setEditName(board.name);
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
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
                              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
                              title="Delete board"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-red-500">
                                <path d="M2 4h12M5.33 4V2.67a1.33 1.33 0 011.34-1.34h2.66a1.33 1.33 0 011.34 1.34V4M12.67 4v9.33a1.33 1.33 0 01-1.34 1.34H4.67a1.33 1.33 0 01-1.34-1.34V4" />
                              </svg>
                            </button>
                          )}
                          {board.access === "shared" && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (leavingBoardId === board.id) return;
                                if (confirm("Remove this board from your list? You can rejoin later with the same link.")) {
                                  leaveBoard(board.id);
                                }
                              }}
                              disabled={leavingBoardId === board.id}
                              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 disabled:opacity-50"
                              title="Leave board (remove from my list)"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-amber-500">
                                <path d="M6 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V3a1 1 0 00-1-1h-2M6 2v2a1 1 0 001 1h2a1 1 0 001-1V2M6 2h4" />
                              </svg>
                            </button>
                          )}
                          {activeTab === "recent" && (
                            <button
                              type="button"
                              onClick={(e) => handleRemoveFromRecent(board.id, e)}
                              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                              title="Remove from recent"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 hover:text-amber-500">
                                <path d="M12 4L4 12M4 4l8 8" />
                              </svg>
                            </button>
                          )}
                        </div>
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
                      <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2 flex-wrap">
                        <span className="truncate min-w-0">{board.name}</span>
                        {board.is_interview && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" title="Interview board">Interview</span>
                        )}
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-1">Delete &ldquo;{boards.find((b) => b.id === deletingBoardId)?.name ?? "board"}&rdquo;?</h3>
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

      {/* Share board modal (from dashboard) */}
      {shareBoard && user && (
        <ShareBoardModal
          boardId={shareBoard.id}
          boardName={shareBoard.name}
          currentUser={user}
          accessToken={accessToken}
          onClose={() => setShareBoard(null)}
        />
      )}
    </div>
  );
}
