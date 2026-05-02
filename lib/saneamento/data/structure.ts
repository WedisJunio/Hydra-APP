import { supabase } from "@/lib/supabase/client";
import type { ProjectPhase } from "@/lib/saneamento/types";
import type { SystemTemplateType } from "@/lib/saneamento/task-templates";

export type PhaseTitle = {
  id: string;
  phase_id: string;
  name: string;
  order: number;
};

export type PhaseSubtitle = {
  id: string;
  title_id: string;
  name: string;
  system_type: SystemTemplateType | null;
  order: number;
};

const TITLE_SELECT = 'id, phase_id, name, "order"';
const SUBTITLE_SELECT = 'id, title_id, name, system_type, "order"';

export async function listPhaseTitles(projectId: string): Promise<PhaseTitle[]> {
  const { data, error } = await supabase
    .from("project_phase_titles")
    .select(`${TITLE_SELECT}, project_phases!inner(project_id)`)
    .eq("project_phases.project_id", projectId)
    .order("order", { ascending: true });
  if (error) {
    console.error("Erro ao listar títulos de fase:", error.message);
    return [];
  }
  return ((data as unknown as PhaseTitle[]) || []).map((row) => ({
    id: row.id,
    phase_id: row.phase_id,
    name: row.name,
    order: row.order,
  }));
}

export async function listPhaseSubtitles(projectId: string): Promise<PhaseSubtitle[]> {
  const { data, error } = await supabase
    .from("project_phase_subtitles")
    .select(
      `${SUBTITLE_SELECT}, project_phase_titles!inner(phase_id, project_phases!inner(project_id))`
    )
    .eq("project_phase_titles.project_phases.project_id", projectId)
    .order("order", { ascending: true });
  if (error) {
    console.error("Erro ao listar subtítulos de fase:", error.message);
    return [];
  }
  return ((data as unknown as PhaseSubtitle[]) || []).map((row) => ({
    id: row.id,
    title_id: row.title_id,
    name: row.name,
    system_type: row.system_type,
    order: row.order,
  }));
}

export async function createPhaseTitle(input: {
  phaseId: string;
  name: string;
  order: number;
}): Promise<PhaseTitle | null> {
  const { data, error } = await supabase
    .from("project_phase_titles")
    .insert({
      phase_id: input.phaseId,
      name: input.name,
      order: input.order,
    })
    .select(TITLE_SELECT)
    .single();
  if (error) {
    console.error("Erro ao criar título:", error.message);
    return null;
  }
  return (data as unknown as PhaseTitle) || null;
}

export async function updatePhaseTitle(
  titleId: string,
  patch: Partial<Pick<PhaseTitle, "name" | "order">>
): Promise<void> {
  await supabase.from("project_phase_titles").update(patch).eq("id", titleId);
}

export async function deletePhaseTitle(titleId: string): Promise<void> {
  await supabase.from("project_phase_titles").delete().eq("id", titleId);
}

export async function rewriteTitleOrders(
  titles: PhaseTitle[],
  phaseId: string
): Promise<void> {
  const samePhase = titles
    .filter((title) => title.phase_id === phaseId)
    .sort((a, b) => a.order - b.order);
  await Promise.all(
    samePhase.map((title, idx) =>
      supabase
        .from("project_phase_titles")
        .update({ order: idx })
        .eq("id", title.id)
    )
  );
}

export async function createPhaseSubtitle(input: {
  titleId: string;
  name: string;
  systemType: SystemTemplateType | null;
  order: number;
}): Promise<PhaseSubtitle | null> {
  const { data, error } = await supabase
    .from("project_phase_subtitles")
    .insert({
      title_id: input.titleId,
      name: input.name,
      system_type: input.systemType,
      order: input.order,
    })
    .select(SUBTITLE_SELECT)
    .single();
  if (error) {
    console.error("Erro ao criar subtítulo:", error.message);
    return null;
  }
  return (data as unknown as PhaseSubtitle) || null;
}

export async function updatePhaseSubtitle(
  subtitleId: string,
  patch: Partial<Pick<PhaseSubtitle, "name" | "order" | "system_type">>
): Promise<void> {
  await supabase.from("project_phase_subtitles").update(patch).eq("id", subtitleId);
}

export async function deletePhaseSubtitle(subtitleId: string): Promise<void> {
  await supabase.from("project_phase_subtitles").delete().eq("id", subtitleId);
}

export async function rewriteSubtitleOrders(
  subtitles: PhaseSubtitle[],
  titleId: string
): Promise<void> {
  const sameTitle = subtitles
    .filter((subtitle) => subtitle.title_id === titleId)
    .sort((a, b) => a.order - b.order);
  await Promise.all(
    sameTitle.map((subtitle, idx) =>
      supabase
        .from("project_phase_subtitles")
        .update({ order: idx })
        .eq("id", subtitle.id)
    )
  );
}

export function groupPhasesHierarchy(
  phases: ProjectPhase[],
  titles: PhaseTitle[],
  subtitles: PhaseSubtitle[]
) {
  return phases
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((phase) => {
      const phaseTitles = titles
        .filter((title) => title.phase_id === phase.id)
        .sort((a, b) => a.order - b.order)
        .map((title) => ({
          ...title,
          subtitles: subtitles
            .filter((subtitle) => subtitle.title_id === title.id)
            .sort((a, b) => a.order - b.order),
        }));
      return {
        ...phase,
        titles: phaseTitles,
      };
    });
}
