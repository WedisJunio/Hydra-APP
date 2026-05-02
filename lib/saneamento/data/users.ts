import { supabase } from "@/lib/supabase/client";

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
  const { data, error } = await supabase
    .from("users")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("Erro ao listar usuários:", error.message);
    return [];
  }
  return (data as unknown as AppUser[]) || [];
}

/** Lista detalhada (com e-mail, papel, status). */
export async function listActiveUsersDetailed(): Promise<AppUserDetailed[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("Erro ao listar usuários:", error.message);
    return [];
  }
  return (data as unknown as AppUserDetailed[]) || [];
}
