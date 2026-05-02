import { supabase } from "@/lib/supabase/client";
import type { Art, ArtType } from "@/lib/saneamento/types";

const SELECT =
  "id, project_id, professional_id, art_number, art_type, activity_description, issued_date, payment_value, paid, paid_date, notes";

export async function listProjectArts(projectId: string): Promise<Art[]> {
  const { data, error } = await supabase
    .from("arts")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar ARTs:", error.message);
    return [];
  }
  return (data as unknown as Art[]) || [];
}

export type CreateArtInput = {
  project_id: string;
  professional_id?: string | null;
  art_number: string;
  art_type: ArtType;
  activity_description?: string | null;
  issued_date?: string | null;
  payment_value?: number | null;
  paid: boolean;
  paid_date?: string | null;
  notes?: string | null;
};

export async function createArt(input: CreateArtInput): Promise<boolean> {
  const { error } = await supabase.from("arts").insert(input);
  if (error) {
    console.error("Erro ao criar ART:", error.message);
    return false;
  }
  return true;
}

export async function deleteArt(id: string): Promise<void> {
  await supabase.from("arts").delete().eq("id", id);
}
