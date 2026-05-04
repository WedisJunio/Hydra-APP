"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  ensureFreshSupabaseSession,
  recoverSupabaseJwtOnce,
} from "@/lib/supabase/session-refresh";
import { clearCurrentProfileCache } from "@/lib/supabase/profile";

/**
 * Mantém o access token renovado enquanto o app está aberto e reconcilia perfil ao refresh.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    void ensureFreshSupabaseSession();

    const timer = window.setInterval(
      () => void ensureFreshSupabaseSession(),
      4 * 60 * 1000
    );

    function onVisible() {
      if (document.visibilityState === "visible") {
        void ensureFreshSupabaseSession();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        clearCurrentProfileCache();
      }
      if (event === "SIGNED_OUT") {
        clearCurrentProfileCache();
      }
    });

    /** Alguns fluxos já tratam JWT; garante segunda linha ao voltar ao app. */
    async function flushOnceRecover() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.expires_at) return;
      if (session.expires_at * 1000 <= Date.now()) {
        await recoverSupabaseJwtOnce();
      }
    }
    void flushOnceRecover();

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      authSubscription.unsubscribe();
    };
  }, []);

  return null;
}
