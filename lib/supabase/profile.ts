import { supabase } from "@/lib/supabase/client";

export type CurrentProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  auth_user_id: string | null;
};

// Cache em memória do perfil do usuário autenticado.
// Evita re-buscar Supabase a cada criação de tarefa/projeto/mensagem.
let cachedProfile: CurrentProfile | null = null;
let cachedAuthUserId: string | null = null;
let inflightPromise: Promise<CurrentProfile | null> | null = null;

// Permite invalidar o cache manualmente (ex.: ao fazer logout).
export function clearCurrentProfileCache() {
  cachedProfile = null;
  cachedAuthUserId = null;
  inflightPromise = null;
}

export async function getCurrentProfile(
  options: { forceRefresh?: boolean } = {}
): Promise<CurrentProfile | null> {
  const { forceRefresh = false } = options;

  if (!forceRefresh && inflightPromise) {
    return inflightPromise;
  }

  const promise = (async () => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Erro ao pegar usuário autenticado:", authError?.message);
      cachedProfile = null;
      cachedAuthUserId = null;
      return null;
    }

    if (
      !forceRefresh &&
      cachedProfile &&
      cachedAuthUserId === user.id
    ) {
      return cachedProfile;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, name, email, role, auth_user_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar perfil do usuário:", error.message);
      return null;
    }

    cachedProfile = (data as CurrentProfile) ?? null;
    cachedAuthUserId = user.id;
    return cachedProfile;
  })();

  inflightPromise = promise;

  try {
    const result = await promise;
    return result;
  } finally {
    // Mantém o cache, mas libera a promise inflight para próximas leituras
    // virem do cache (sem dispar nova rede).
    inflightPromise = null;
  }
}
