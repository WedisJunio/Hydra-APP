import { supabase } from "@/lib/supabase/client";
import type {
  JournalCategory,
  JournalEntry,
} from "@/lib/saneamento/types";

const SELECT =
  "id, project_id, task_id, phase_id, author_id, entry_date, category, title, content, hours_worked, created_at, updated_at";

export async function listProjectJournal(
  projectId: string
): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from("project_journal_entries")
    .select(SELECT)
    .eq("project_id", projectId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar diário:", error.message);
    return [];
  }
  return (data as unknown as JournalEntry[]) || [];
}

export async function listTaskJournal(
  taskId: string
): Promise<JournalEntry[]> {
  const { data, error } = await supabase
    .from("project_journal_entries")
    .select(SELECT)
    .eq("task_id", taskId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Erro ao listar diário da tarefa:", error.message);
    return [];
  }
  return (data as unknown as JournalEntry[]) || [];
}

/** Conta entradas de diário por task_id num projeto. Útil pra badges. */
export async function getJournalCountsByTask(
  projectId: string
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("project_journal_entries")
    .select("task_id")
    .eq("project_id", projectId)
    .not("task_id", "is", null);
  const counts = new Map<string, number>();
  const rows = (data as unknown as { task_id: string | null }[]) || [];
  for (const r of rows) {
    if (r.task_id) {
      counts.set(r.task_id, (counts.get(r.task_id) || 0) + 1);
    }
  }
  return counts;
}

export type CreateJournalInput = {
  project_id: string;
  task_id?: string | null;
  phase_id?: string | null;
  author_id: string;
  entry_date: string;
  category: JournalCategory;
  title?: string | null;
  content: string;
  hours_worked?: number | null;
};

export async function createJournalEntry(
  input: CreateJournalInput
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("project_journal_entries")
    .insert(input);
  if (error) {
    console.error("Erro ao criar entrada:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type UpdateJournalInput = Partial<{
  entry_date: string;
  category: JournalCategory;
  task_id: string | null;
  phase_id: string | null;
  title: string | null;
  content: string;
  hours_worked: number | null;
}>;

export async function updateJournalEntry(
  id: string,
  patch: UpdateJournalInput
): Promise<void> {
  await supabase.from("project_journal_entries").update(patch).eq("id", id);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await supabase.from("project_journal_entries").delete().eq("id", id);
}
