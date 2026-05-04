import { supabase } from "@/lib/supabase/client";
import {
  isLikelyJwtExpiredMessage,
  logSupabaseUnlessJwt,
} from "@/lib/supabase/errors";
import { recoverSupabaseJwtOnce } from "@/lib/supabase/session-refresh";

export type AppUser = {
  id: string;
  name: string;
};

export type AppUserDetailed = AppUser & {
  email: string;
  role: string;
  is_active: boolean;
};

/** Lista usuários ativos (apenas id + nome). Útil pra selects. */
export async function listActiveUsers(): Promise<AppUser[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) {
      if (isLikelyJwtExpiredMessage(error) && attempt === 0) {
        await recoverSupabaseJwtOnce();
        continue;
      }
      logSupabaseUnlessJwt("Erro ao listar usuários:", error);
      return [];
    }
    return (data as unknown as AppUser[]) || [];
  }
  return [];
}

/** Lista detalhada (com e-mail, papel, status). */
export async function listActiveUsersDetailed(): Promise<AppUserDetailed[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) {
      if (isLikelyJwtExpiredMessage(error) && attempt === 0) {
        await recoverSupabaseJwtOnce();
        continue;
      }
      logSupabaseUnlessJwt("Erro ao listar usuários:", error);
      return [];
    }
    return (data as unknown as AppUserDetailed[]) || [];
  }
  return [];
}
