const STORAGE_KEY = "collabboard-recent";
const MAX_RECENT = 20;

export interface RecentEntry {
  boardId: string;
  openedAt: number;
}

export function getRecentBoardIds(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentBoard(boardId: string): void {
  if (typeof window === "undefined") return;
  try {
    const list = getRecentBoardIds();
    const now = Date.now();
    const next = [
      { boardId, openedAt: now },
      ...list.filter((e) => e.boardId !== boardId),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function removeRecentBoard(boardId: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = getRecentBoardIds().filter((e) => e.boardId !== boardId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearRecentBoards(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  } catch {
    // ignore
  }
}
