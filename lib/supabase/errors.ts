export function extractPostgrestErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: string }).message ?? "");
  }
  if (typeof error === "string") return error;
  return "";
}

/** Erros típicos de access token ao PostgREST/Supabase já expirou. */
export function isLikelyJwtExpiredMessage(source: unknown): boolean {
  const msg = typeof source === "string" ? source : extractPostgrestErrorMessage(source);
  const l = msg.toLowerCase();
  return (
    l.includes("jwt expired") ||
    l.includes("token is expired") ||
    (l.includes("jwt") && l.includes("expired")) ||
    (l.includes("invalid jwt") && (l.includes("expired") || l.includes("expire")))
  );
}

/**
 * Evita encher o overlay de desenvolvimento com erros esperados quando a sessão cai.
 * Preferir em data loaders que fazem console.error(message).
 */
export function logSupabaseUnlessJwt(scope: string, error: unknown) {
  if (isLikelyJwtExpiredMessage(error)) return;
  const msg = extractPostgrestErrorMessage(error) || String(error);
  console.error(scope, msg);
}

function normalizeErrorMessage(rawMessage: string) {
  const lower = rawMessage.toLowerCase();

  if (lower.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (lower.includes("jwt") || lower.includes("token")) {
    return "Sua sessão expirou. Entre novamente.";
  }
  if (lower.includes("permission denied") || lower.includes("row-level security")) {
    return "Você não tem permissão para esta ação.";
  }
  if (lower.includes("duplicate key") || lower.includes("unique constraint")) {
    return "Já existe um registro com esses dados.";
  }
  if (lower.includes("violates foreign key constraint")) {
    return "Não foi possível concluir porque há vínculos com outros registros.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}

/** True quando o banco ainda não tem a coluna planned_end_target (rode lib/sql/auto-project-planned-end-from-tasks.sql). */
export function isMissingPlannedEndTargetColumn(error: unknown): boolean {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message ?? "")
      : typeof error === "string"
        ? error
        : "";
  const lower = msg.toLowerCase();
  return lower.includes("planned_end_target") && lower.includes("does not exist");
}

export function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return "Ocorreu um erro inesperado.";
  }

  const maybeMessage = "message" in error ? String(error.message || "") : "";
  if (!maybeMessage) {
    return "Ocorreu um erro inesperado.";
  }

  return normalizeErrorMessage(maybeMessage);
}
