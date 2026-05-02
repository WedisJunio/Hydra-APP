import { supabase } from "@/lib/supabase/client";
import type { DocumentRevision } from "@/lib/saneamento/types";

const SELECT =
  "id, project_id, document_name, document_type, revision_code, description, file_url, author_id, created_at";

export async function listProjectRevisions(
  projectId: string
): Promise<DocumentRevision[]> {
  const { data, error } = await supabase
    .from("document_revisions")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar revisões:", error.message);
    return [];
  }
  return (data as unknown as DocumentRevision[]) || [];
}

export type CreateRevisionInput = {
  project_id: string;
  document_name: string;
  document_type?: string | null;
  revision_code: string;
  description?: string | null;
  file_url?: string | null;
  author_id?: string | null;
};

export async function createRevision(
  input: CreateRevisionInput
): Promise<boolean> {
  const { error } = await supabase.from("document_revisions").insert(input);
  if (error) {
    console.error("Erro ao criar revisão:", error.message);
    return false;
  }
  return true;
}

export async function deleteRevision(id: string): Promise<void> {
  await supabase.from("document_revisions").delete().eq("id", id);
}
