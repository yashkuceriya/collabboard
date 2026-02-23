"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AppHeader } from "@/components/app-header";
import { getDisplayName, getInitials } from "@/lib/display-name";

const AVATAR_COLORS = [
  "#EF4444",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarColor, setAvatarColor] = useState("#6366F1");
  const [avatarEmoji, setAvatarEmoji] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      if (!u) {
        router.push("/auth");
        return;
      }
      if (cancelled) return;
      setUser(u);
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      setFirstName((meta.first_name as string) ?? (meta.full_name ? String(meta.full_name).split(/\s+/)[0] ?? "" : ""));
      setLastName((meta.last_name as string) ?? (meta.full_name && String(meta.full_name).includes(" ") ? String(meta.full_name).split(/\s+/).slice(1).join(" ") : ""));
      setAvatarColor((meta.avatar_color as string) ?? "#6366F1");
      setAvatarEmoji((meta.avatar_emoji as string) ?? "");
      setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || null;
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          full_name: fullName,
          avatar_color: avatarColor,
          avatar_emoji: avatarEmoji.trim() || null,
        },
      });
      if (updateError) throw updateError;
      setSuccess("Profile saved.");
      setUser((prev) => prev ? { ...prev, user_metadata: { ...prev.user_metadata, first_name: firstName.trim() || undefined, last_name: lastName.trim() || undefined, full_name: fullName ?? undefined, avatar_color: avatarColor, avatar_emoji: avatarEmoji.trim() || undefined } } : null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  const displayName = user
    ? [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || getDisplayName(user)
    : "";
  const avatarDisplay = avatarEmoji.trim() ? avatarEmoji.trim().slice(0, 2) : (displayName ? getInitials(displayName) : "?");

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900 flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
      <AppHeader variant="profile" user={user} onSignOut={handleSignOut} />

      <main className="max-w-md mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 mb-8">
          Optionally add your name. It will be used for your avatar on boards.
        </p>

        <form onSubmit={handleSave} className="space-y-5">
          {error && (
            <div className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
            <input
              type="email"
              readOnly
              value={user?.email ?? ""}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">First name</label>
            <input
              type="text"
              placeholder="Optional"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Last name</label>
            <input
              type="text"
              placeholder="Optional"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Avatar color</label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setAvatarColor(color)}
                  className="w-9 h-9 rounded-full border-2 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                  style={{
                    backgroundColor: color,
                    borderColor: avatarColor === color ? "#111" : "transparent",
                    boxShadow: avatarColor === color ? "0 0 0 2px var(--background, #fff)" : undefined,
                  }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                style={{ backgroundColor: avatarColor }}
              >
                {avatarDisplay}
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">Preview</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Avatar emoji (optional)</label>
            <input
              type="text"
              placeholder="e.g. 😀 or leave blank for initial"
              value={avatarEmoji}
              onChange={(e) => setAvatarEmoji(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold shadow-md shadow-emerald-500/25 disabled:opacity-50 disabled:pointer-events-none transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </main>
    </div>
  );
}
