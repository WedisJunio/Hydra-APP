import { supabase } from "@/lib/supabase/client";
import { isMissingPlannedEndTargetColumn } from "@/lib/supabase/errors";
import { mergeProjectPlannedEnd } from "@/lib/utils";
import type { SanitationProject, SanitationType } from "@/lib/saneamento/types";

/** Lista saneamento sem depender apenas de discipline = lowercase (Postgres é case-sensitive). */
const SANITATION_LIST_OR_FILTER =
  "discipline.ilike.saneamento,sanitation_type.not.is.null";

const SELECT_FULL =
  "id, name, manager_id, coordinator_id, leader_id, planned_end_date, planned_end_target, actual_end_date, created_at, discipline, client_id, contract_number, sanitation_type, municipality, state, design_flow_lps, population_current, population_final, horizon_years, network_length_m, treatment_system, contract_value, notes";

/** Mesmo campo sem planned_end_target (banco antes da migration SQL). */
const SELECT_LEGACY =
  "id, name, manager_id, coordinator_id, leader_id, planned_end_date, actual_end_date, created_at, discipline, client_id, contract_number, sanitation_type, municipality, state, design_flow_lps, population_current, population_final, horizon_years, network_length_m, treatment_system, contract_value, notes";

function normalizeSanitationRows(
  rows: Record<string, unknown>[] | null
): SanitationProject[] {
  return (
    rows?.map(
      (r): SanitationProject => ({
        ...(r as unknown as SanitationProject),
        planned_end_target:
          typeof (r as { planned_end_target?: unknown }).planned_end_target === "string"
            ? ((r as { planned_end_target: string }).planned_end_target)
            : null,
      })
    ) ?? []
  );
}

/** Lista projetos do módulo saneamento (disciplina saneamento ou tipo SAA/SES preenchido). */
export async function listSanitationProjects(): Promise<SanitationProject[]> {
  const tryFull = await supabase
    .from("projects")
    .select(SELECT_FULL)
    .or(SANITATION_LIST_OR_FILTER)
    .order("created_at", { ascending: false });

  let error = tryFull.error;
  let rowsRaw: unknown = tryFull.data;

  if (error && isMissingPlannedEndTargetColumn(error)) {
    const second = await supabase
      .from("projects")
      .select(SELECT_LEGACY)
      .or(SANITATION_LIST_OR_FILTER)
      .order("created_at", { ascending: false });
    error = second.error;
    rowsRaw = second.data;
  }

  if (error) {
    console.error("Erro ao listar projetos:", error.message);
    return [];
  }

  return normalizeSanitationRows(
    (Array.isArray(rowsRaw) ? rowsRaw : []) as unknown as Record<
      string,
      unknown
    >[]
  );
}

export async function getSanitationProject(
  id: string
): Promise<SanitationProject | null> {
  const tryFull = await supabase
    .from("projects")
    .select(SELECT_FULL)
    .eq("id", id)
    .maybeSingle();

  let error = tryFull.error;
  let row: unknown = tryFull.data;

  if (error && isMissingPlannedEndTargetColumn(error)) {
    const second = await supabase
      .from("projects")
      .select(SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle();
    error = second.error;
    row = second.data;
  }

  if (error) {
    console.error("Erro ao buscar projeto:", error.message);
    return null;
  }
  if (row === null || row === undefined || typeof row !== "object") return null;

  const normalized = normalizeSanitationRows([row as Record<string, unknown>]);
  return normalized[0] ?? null;
}

export type CreateSanitationProjectInput = {
  name: string;
  manager_id: string;
  created_by: string;
  client_id?: string | null;
  contract_number?: string | null;
  sanitation_type?: SanitationType | null;
  municipality?: string | null;
  state?: string | null;
  contract_value?: number | null;
  planned_end_target?: string | null;
  notes?: string | null;
};

/** Cria um projeto novo de saneamento. Retorna o ID criado. */
export async function createSanitationProject(
  input: CreateSanitationProjectInput
): Promise<string | null> {
  const target = input.planned_end_target?.trim().slice(0, 10) || null;
  const { planned_end_target: _omit, ...rest } = input;
  const effectivePlannedEnd = mergeProjectPlannedEnd(target, null);

  const baseInsert = {
    ...rest,
    planned_end_date: effectivePlannedEnd,
    discipline: "saneamento" as const,
  };
  const tryInsert =
    target != null ? { ...baseInsert, planned_end_target: target } : baseInsert;

  let { data, error } = await supabase
    .from("projects")
    .insert(tryInsert)
    .select("id")
    .single();

  if (
    error &&
    isMissingPlannedEndTargetColumn(error) &&
    target != null
  ) {
    ({ data, error } = await supabase
      .from("projects")
      .insert(baseInsert)
      .select("id")
      .single());
  }

  if (error || !data) {
    console.error("Erro ao criar projeto:", error?.message);
    return null;
  }
  return data.id as string;
}

export type TechnicalParameters = {
  design_flow_lps?: number | null;
  population_current?: number | null;
  population_final?: number | null;
  horizon_years?: number | null;
  network_length_m?: number | null;
  treatment_system?: string | null;
};

/** Atualiza só os parâmetros técnicos (vazão, população, etc.). */
export async function updateProjectTechnicalParameters(
  projectId: string,
  params: TechnicalParameters
): Promise<boolean> {
  const { error } = await supabase
    .from("projects")
    .update(params)
    .eq("id", projectId);
  if (error) {
    console.error("Erro ao atualizar parâmetros técnicos:", error.message);
    return false;
  }
  return true;
}
