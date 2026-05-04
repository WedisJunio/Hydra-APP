import { supabase } from "@/lib/supabase/client";

/** Renova o access token antes de ficar inválido (mitiga “JWT expired” em páginas abertas). */
export async function ensureFreshSupabaseSession(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.expires_at) return;

  const msLeft = session.expires_at * 1000 - Date.now();
  if (msLeft < 5 * 60_000) {
    await supabase.auth.refreshSession();
  }
}

/** Uma tentativa explícita de refresh (refresh token ainda válido). */
export async function recoverSupabaseJwtOnce(): Promise<boolean> {
  const { error } = await supabase.auth.refreshSession();
  return !error;
}
