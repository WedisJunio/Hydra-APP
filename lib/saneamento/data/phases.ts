import { supabase } from "@/lib/supabase/client";
import type { ProjectPhase, PhaseStatus } from "@/lib/saneamento/types";
import { SANEAMENTO_PHASE_TEMPLATE } from "@/lib/saneamento/phases";

const SELECT =
  'id, project_id, name, code, "order", status, planned_start_date, planned_end_date, actual_start_date, actual_end_date, notes';

export async function listProjectPhases(
  projectId: string
): Promise<ProjectPhase[]> {
  const { data, error } = await supabase
    .from("project_phases")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("order", { ascending: true });
  if (error) {
    console.error("Erro ao listar etapas:", error.message);
    return [];
  }
  return (data as unknown as ProjectPhase[]) || [];
}

/** Lista etapas de vários projetos de uma só vez (para list page). */
export async function listPhasesForProjects(
  projectIds: string[]
): Promise<ProjectPhase[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("project_phases")
    .select(SELECT)
    .in("project_id", projectIds);
  if (error) {
    console.error("Erro ao listar etapas (lote):", error.message);
    return [];
  }
  return (data as unknown as ProjectPhase[]) || [];
}

/** Cria as etapas padrão de saneamento para um projeto recém-criado. */
export async function seedDefaultPhases(projectId: string): Promise<void> {
  const rows = SANEAMENTO_PHASE_TEMPLATE.map((tpl, idx) => ({
    project_id: projectId,
    name: tpl.name,
    code: tpl.code,
    order: idx,
    status: idx === 0 ? "in_progress" : "pending",
  }));
  await supabase.from("project_phases").insert(rows);
}

export async function createPhase(input: {
  projectId: string;
  name: string;
  order: number;
  status?: PhaseStatus;
}): Promise<boolean> {
  const { error } = await supabase.from("project_phases").insert({
    project_id: input.projectId,
    name: input.name,
    order: input.order,
    status: input.status ?? "pending",
  });
  if (error) {
    console.error("Erro ao criar etapa:", error.message);
    return false;
  }
  return true;
}

export async function renamePhase(
  phaseId: string,
  name: string
): Promise<void> {
  await supabase.from("project_phases").update({ name }).eq("id", phaseId);
}

export async function deletePhase(phaseId: string): Promise<void> {
  await supabase.from("project_phases").delete().eq("id", phaseId);
}

export async function updatePhaseStatus(
  phase: ProjectPhase,
  status: PhaseStatus
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  const today = new Date().toISOString().slice(0, 10);
  if (status === "in_progress" && !phase.actual_start_date) {
    updates.actual_start_date = today;
  }
  if (status === "approved" && !phase.actual_end_date) {
    updates.actual_end_date = today;
  }
  await supabase.from("project_phases").update(updates).eq("id", phase.id);
}

/**
 * Reescreve os "order" das fases pra ficarem 0..N-1 contíguos. Aceita um
 * array já na ordem desejada.
 */
export async function rewritePhaseOrders(
  orderedPhases: ProjectPhase[]
): Promise<void> {
  await Promise.all(
    orderedPhases.map((p, i) =>
      supabase.from("project_phases").update({ order: i }).eq("id", p.id)
    )
  );
}
