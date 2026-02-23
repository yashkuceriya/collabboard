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

  const passwordStrength = password.length === 0 ? null : password.length < 6 ? "weak" : password.length < 10 ? "medium" : "strong";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 px-4 relative overflow-hidden">
      {/* Animated floating shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute w-72 h-72 rounded-full bg-blue-200/30 dark:bg-blue-900/20 -top-20 -left-20 animate-float" />
        <div className="absolute w-48 h-48 rounded-2xl bg-indigo-200/25 dark:bg-indigo-900/15 top-1/4 right-10 rotate-12 animate-float-25-reverse" />
        <div className="absolute w-32 h-32 rounded-full bg-purple-200/20 dark:bg-purple-900/10 bottom-32 left-1/4 animate-float-18-delay-2" />
        <div className="absolute w-56 h-56 rounded-3xl bg-sky-200/20 dark:bg-sky-900/10 -bottom-10 right-1/4 -rotate-6 animate-float-22-reverse-delay-1" />
        <div className="absolute w-20 h-20 rounded-lg bg-amber-200/20 dark:bg-amber-900/10 top-20 left-1/3 rotate-45 animate-float-15-delay-3" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30 mb-4 ring-4 ring-white/50 dark:ring-gray-800/50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 8h6M8 12h8M9 16h6" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">CollabBoard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 font-medium">Think together. Build together.</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-gray-200/60 dark:shadow-black/40 border border-gray-200/60 dark:border-gray-800/60 p-7">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-5 text-center">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>

          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2.5 mb-4 flex items-center justify-center gap-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-md hover:-translate-y-0.5 text-sm font-medium text-gray-700 dark:text-gray-200 transition-all duration-200 disabled:opacity-50 shadow-sm"
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
              <span className="bg-white/80 dark:bg-gray-900/80 px-2 text-gray-400 dark:text-gray-500">or</span>
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
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/80 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
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
                className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50/80 dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="••••••••"
              />
              {isSignUp && passwordStrength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${passwordStrength === "weak" ? "w-1/3 bg-red-400" : passwordStrength === "medium" ? "w-2/3 bg-amber-400" : "w-full bg-green-400"}`} />
                  </div>
                  <span className={`text-[10px] font-medium capitalize ${passwordStrength === "weak" ? "text-red-500" : passwordStrength === "medium" ? "text-amber-500" : "text-green-500"}`}>{passwordStrength}</span>
                </div>
              )}
              {!isSignUp && <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Min 6 characters</p>}
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
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl disabled:opacity-50 text-sm font-medium transition-all shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {isSignUp ? "Creating..." : "Signing in..."}
                </span>
              ) : isSignUp ? "Create Account" : "Sign In"}
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

        {/* Feature highlights */}
        <div className="mt-8 flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
            </div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Real-time</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2"><path d="M12 2a4 4 0 014 4c0 1.95-2 4-4 6-2-2-4-4.05-4-6a4 4 0 014-4z" /><path d="M4.93 10.93a10 10 0 0014.14 0" /><path d="M2.5 16.5a14 14 0 0019 0" /></svg>
            </div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">AI-Powered</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            </div>
            <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">Interview Ready</span>
          </div>
        </div>
      </div>

      {/* Powered by footer */}
      <p className="absolute bottom-4 text-[11px] text-gray-400 dark:text-gray-600">
        Built with Next.js, Supabase &amp; OpenAI
      </p>
    </div>
  );
}
