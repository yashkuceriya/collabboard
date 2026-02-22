export function getDisplayName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): string {
  if (!user) return "User";
  const meta = user.user_metadata;
  const fullName = (meta?.full_name ?? meta?.name) as string | undefined;
  if (fullName && fullName.trim()) return fullName.trim();
  if (user.email) {
    const local = user.email.split("@")[0];
    return local && local.length <= 24 ? local : user.email.slice(0, 21) + "\u2026";
  }
  return "User";
}

export function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (displayName[0] ?? "?").toUpperCase();
}

/** Avatar display: emoji if set in user_metadata, otherwise initials from display name */
export function getAvatarDisplay(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
  displayName?: string
): string {
  if (!user) return "?";
  const meta = user.user_metadata;
  const emoji = (meta?.avatar_emoji as string)?.trim();
  if (emoji) return emoji.slice(0, 2); // single emoji or two chars
  const name = displayName ?? getDisplayName(user);
  return getInitials(name);
}
