import { supabase } from "@/lib/supabase/client";
import type { SanitationProject, SanitationType } from "@/lib/saneamento/types";

const SELECT =
  "id, name, manager_id, coordinator_id, leader_id, planned_end_date, actual_end_date, created_at, discipline, client_id, contract_number, sanitation_type, municipality, state, design_flow_lps, population_current, population_final, horizon_years, network_length_m, treatment_system, contract_value, notes";

/** Lista projetos com discipline = 'saneamento'. */
export async function listSanitationProjects(): Promise<SanitationProject[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("discipline", "saneamento")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar projetos:", error.message);
    return [];
  }
  return (data as unknown as SanitationProject[]) || [];
}

export async function getSanitationProject(
  id: string
): Promise<SanitationProject | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Erro ao buscar projeto:", error.message);
    return null;
  }
  return (data as unknown as SanitationProject) || null;
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
  planned_end_date?: string | null;
  notes?: string | null;
};

/** Cria um projeto novo de saneamento. Retorna o ID criado. */
export async function createSanitationProject(
  input: CreateSanitationProjectInput
): Promise<string | null> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...input,
      discipline: "saneamento",
    })
    .select("id")
    .single();
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
