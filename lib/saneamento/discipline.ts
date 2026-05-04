/**
 * Regras para alinhar UI "Saneamento" à coluna discipline / tipo de saneamento.
 * Postgres e PostgREST comparam texto com casing exato — precisamos tratar variantes.
 */

export function isSaneamentoDiscipline(
  discipline: string | null | undefined
): boolean {
  return String(discipline ?? "").trim().toLowerCase() === "saneamento";
}

/** Incluído na lista/portfolio saneamento quando disciplina saneamento (case-insensitive) ou tipo SAA/SES preenchido. */
export function projectQualifiesForSaneamentoModule(
  discipline: string | null | undefined,
  sanitation_type: string | null | undefined
): boolean {
  if (isSaneamentoDiscipline(discipline)) return true;
  return String(sanitation_type ?? "").trim().length > 0;
}

/** Uma entrada de aba na página Projetos: saneamento sempre em minúsculas canônicas. */
export function disciplineTabKey(
  discipline: string | null | undefined
): string | null {
  const raw = String(discipline ?? "").trim();
  if (!raw) return null;
  if (raw.toLowerCase() === "saneamento") return "saneamento";
  return raw;
}
