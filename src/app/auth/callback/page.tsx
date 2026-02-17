"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function parseHashFragment(hash: string): { access_token?: string; refresh_token?: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    access_token: params.get("access_token") ?? undefined,
    refresh_token: params.get("refresh_token") ?? undefined,
  };
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Confirming your email…");

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const hash = typeof window !== "undefined" ? window.location.hash : "";

    // Flow 1: Supabase redirected here with session in hash (default email template)
    if (hash) {
      const { access_token, refresh_token } = parseHashFragment(hash);
      if (access_token && refresh_token) {
        supabase.auth
          .setSession({ access_token, refresh_token })
          .then(() => router.replace("/dashboard"))
          .catch(() => {
            setMessage("Something went wrong.");
            setTimeout(() => router.replace("/auth"), 3000);
          });
        return;
      }
    }

    // Flow 2: Custom link to our app with token_hash and type (verifyOtp)
    if (tokenHash && type) {
      supabase.auth
        .verifyOtp({ token_hash: tokenHash, type: type as "email" | "signup" })
        .then(({ error }) => {
          if (error) {
            setMessage(error.message);
            setTimeout(() => router.replace("/auth"), 3000);
            return;
          }
          router.replace("/dashboard");
        })
        .catch(() => {
          setMessage("Something went wrong.");
          setTimeout(() => router.replace("/auth"), 3000);
        });
      return;
    }

    setMessage("Invalid or missing confirmation link.");
    setTimeout(() => router.replace("/auth"), 3000);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="text-center text-gray-600 dark:text-gray-400">{message}</div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="text-gray-600 dark:text-gray-400">Loading…</div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
