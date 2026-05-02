import { supabase } from "@/lib/supabase/client";
import type { ExternalApproval } from "@/lib/saneamento/types";

const SELECT =
  "id, project_id, agency, approval_type, process_number, submitted_date, expected_response_days, expected_response_date, actual_response_date, status, notes, responsible_user_id";

export async function listProjectApprovals(
  projectId: string
): Promise<ExternalApproval[]> {
  const { data, error } = await supabase
    .from("external_approvals")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar aprovações:", error.message);
    return [];
  }
  return (data as unknown as ExternalApproval[]) || [];
}

/** Lista aprovações de vários projetos de uma só vez (para list page). */
export async function listApprovalsForProjects(
  projectIds: string[]
): Promise<ExternalApproval[]> {
  if (projectIds.length === 0) return [];
  const { data, error } = await supabase
    .from("external_approvals")
    .select(SELECT)
    .in("project_id", projectIds);
  if (error) {
    console.error("Erro ao listar aprovações (lote):", error.message);
    return [];
  }
  return (data as unknown as ExternalApproval[]) || [];
}

export type CreateApprovalInput = {
  project_id: string;
  agency: string;
  approval_type?: string | null;
  process_number?: string | null;
  submitted_date?: string | null;
  expected_response_days?: number | null;
  expected_response_date?: string | null;
  status: ExternalApproval["status"];
  notes?: string | null;
  responsible_user_id?: string | null;
};

export async function createApproval(
  input: CreateApprovalInput
): Promise<boolean> {
  const { error } = await supabase.from("external_approvals").insert(input);
  if (error) {
    console.error("Erro ao criar aprovação:", error.message);
    return false;
  }
  return true;
}

export async function deleteApproval(id: string): Promise<void> {
  await supabase.from("external_approvals").delete().eq("id", id);
}

export async function setApprovalStatus(
  id: string,
  status: "approved" | "rejected"
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from("external_approvals")
    .update({ status, actual_response_date: today })
    .eq("id", id);
}
