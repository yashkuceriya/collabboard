import type { BoardElement } from "@/lib/types/database";

/** Compare two elements for draw/display order: by z_index (in properties), then by created_at. */
export function compareElementOrder(a: BoardElement, b: BoardElement): number {
  const za = (a.properties as Record<string, number> | undefined)?.z_index ?? 0;
  const zb = (b.properties as Record<string, number> | undefined)?.z_index ?? 0;
  if (za !== zb) return za - zb;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/** Sort elements in place by z_index then created_at. Returns the same array (sorted). */
export function sortElementsByOrder(elements: BoardElement[]): BoardElement[] {
  return elements.sort(compareElementOrder);
}
