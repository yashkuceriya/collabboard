"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function getAppUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "http://localhost:3000";
  const url = base.startsWith("http") ? base : `https://${base}`;
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isSignUp) {
        const redirectTo = `${getAppUrl()}/auth/callback`;
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (signUpError) throw signUpError;
        setSuccess("Account created! You can now sign in.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      if (message.toLowerCase().includes("rate limit") || message.toLowerCase().includes("rate_limit")) {
        setError("Too many sign-up attempts. Please wait a few minutes and try again.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const redirectTo = `${getAppUrl()}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 mb-4">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">CollabBoard</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Real-time collaborative whiteboard</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-gray-200/60 dark:shadow-black/40 border border-gray-200/60 dark:border-gray-800/60 p-7">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-5 text-center">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 mb-4 flex items-center justify-center gap-2.5 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
            </svg>
            Continue with Google
          </button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-gray-900 px-2 text-gray-400 dark:text-gray-500">or</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="••••••••"
              />
              <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Min 6 characters</p>
            </div>

            {success && (
              <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800/40">{success}</div>
            )}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-100 dark:border-red-800/40">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl disabled:opacity-50 text-sm font-medium transition-all shadow-sm shadow-blue-500/25"
            >
              {loading ? "Loading..." : isSignUp ? "Create Account" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-gray-400 dark:text-gray-500">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}
