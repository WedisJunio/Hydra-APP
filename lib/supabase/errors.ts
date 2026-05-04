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
