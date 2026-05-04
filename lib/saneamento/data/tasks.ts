import { supabase } from "@/lib/supabase/client";
import {
  isLikelyJwtExpiredMessage,
  logSupabaseUnlessJwt,
} from "@/lib/supabase/errors";
import { recoverSupabaseJwtOnce } from "@/lib/supabase/session-refresh";
import { getTodayLocalISO } from "@/lib/utils";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  project_id: string;
  phase_id: string | null;
  title_id: string | null;
  subtitle_id: string | null;
  assigned_to: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  priority: "low" | "medium" | "high" | "critical" | null;
  start_date: string | null;
  completion_date: string | null;
  comments: string | null;
  attachments: string[];
  phase_task_order: number;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  time_spent_seconds: number;
  is_timer_running: boolean;
};

const SELECT =
  "id, title, description, status, project_id, phase_id, title_id, subtitle_id, assigned_to, planned_due_date, actual_completed_date, priority, start_date, completion_date, comments, attachments, phase_task_order, started_at, paused_at, completed_at, time_spent_seconds, is_timer_running";

export async function listProjectTasks(projectId: string): Promise<Task[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("tasks")
      .select(SELECT)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) {
      if (isLikelyJwtExpiredMessage(error) && attempt === 0) {
        await recoverSupabaseJwtOnce();
        continue;
      }
      logSupabaseUnlessJwt("Erro ao listar tarefas:", error);
      return [];
    }
    return (data as unknown as Task[]) || [];
  }
  return [];
}

export async function countProjectTasks(projectId: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { count, error } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (error) {
      if (isLikelyJwtExpiredMessage(error) && attempt === 0) {
        await recoverSupabaseJwtOnce();
        continue;
      }
      logSupabaseUnlessJwt("Erro ao contar tarefas:", error);
      return 0;
    }
    return count ?? 0;
  }
  return 0;
}

export type CreateTaskInput = {
  project_id: string;
  phase_id?: string | null;
  title_id?: string | null;
  subtitle_id?: string | null;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  planned_due_date?: string | null;
  priority?: "low" | "medium" | "high" | "critical" | null;
  start_date?: string | null;
  completion_date?: string | null;
  comments?: string | null;
  attachments?: string[];
  phase_task_order?: number;
  status?: string;
  created_by: string;
};

export async function createTask(input: CreateTaskInput): Promise<boolean> {
  const today = getTodayLocalISO();
  const isCompleted = (input.status ?? "pending") === "completed";
  const { error } = await supabase.from("tasks").insert({
    title: input.title,
    description: input.description ?? null,
    project_id: input.project_id,
    phase_id: input.phase_id ?? null,
    title_id: input.title_id ?? null,
    subtitle_id: input.subtitle_id ?? null,
    status: input.status ?? "pending",
    created_by: input.created_by,
    assigned_to: input.assigned_to ?? null,
    planned_due_date: input.planned_due_date ?? null,
    priority: input.priority ?? "medium",
    // Regra de negócio: data de início nasce no dia da criação.
    start_date: today,
    completion_date: isCompleted ? input.completion_date ?? today : input.completion_date ?? null,
    actual_completed_date: isCompleted ? today : null,
    comments: input.comments ?? null,
    attachments: input.attachments ?? [],
    phase_task_order: input.phase_task_order ?? 0,
    time_spent_seconds: 0,
    is_timer_running: false,
  });
  if (error) {
    logSupabaseUnlessJwt("Erro ao criar tarefa:", error);
    return false;
  }
  return true;
}

export type UpdateTaskInput = Partial<{
  status: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  phase_id: string | null;
  title_id: string | null;
  subtitle_id: string | null;
  priority: "low" | "medium" | "high" | "critical" | null;
  start_date: string | null;
  completion_date: string | null;
  comments: string | null;
  attachments: string[];
  phase_task_order: number;
}>;

export async function updateTask(
  taskId: string,
  patch: UpdateTaskInput
): Promise<void> {
  await supabase.from("tasks").update(patch).eq("id", taskId);
}

export async function deleteTask(taskId: string): Promise<void> {
  await supabase.from("tasks").delete().eq("id", taskId);
}

// ─── Timer ops ────────────────────────────────────────────────────────────

function getLiveSeconds(task: Task) {
  if (!task.is_timer_running || !task.started_at) {
    return task.time_spent_seconds || 0;
  }
  const startedAt = new Date(task.started_at).getTime();
  const runningSeconds = Math.max(
    Math.floor((Date.now() - startedAt) / 1000),
    0
  );
  return (task.time_spent_seconds || 0) + runningSeconds;
}

export async function startTaskTimer(task: Task): Promise<void> {
  if (task.status === "completed") return;
  await supabase
    .from("tasks")
    .update({
      started_at: new Date().toISOString(),
      paused_at: null,
      is_timer_running: true,
      status: task.status === "pending" ? "in_progress" : task.status,
    })
    .eq("id", task.id);
}

export async function pauseTaskTimer(task: Task): Promise<void> {
  if (!task.is_timer_running || !task.started_at) return;
  await supabase
    .from("tasks")
    .update({
      time_spent_seconds: getLiveSeconds(task),
      paused_at: new Date().toISOString(),
      started_at: null,
      is_timer_running: false,
    })
    .eq("id", task.id);
}

export async function finishTask(task: Task): Promise<void> {
  const today = getTodayLocalISO();
  await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      actual_completed_date: task.actual_completed_date || today,
      completion_date: today,
      time_spent_seconds: getLiveSeconds(task),
      started_at: null,
      paused_at: null,
      is_timer_running: false,
    })
    .eq("id", task.id);
}

export async function reopenTask(task: Task): Promise<void> {
  await supabase
    .from("tasks")
    .update({
      status: "in_progress",
      completed_at: null,
      actual_completed_date: null,
      completion_date: null,
    })
    .eq("id", task.id);
}

export async function setTaskStatus(
  task: Task,
  newStatus: string
): Promise<void> {
  if (newStatus === "completed") {
    return finishTask(task);
  }
  await supabase
    .from("tasks")
    .update({
      status: newStatus,
      actual_completed_date: null,
      completion_date: null,
      completed_at: null,
      is_timer_running: false,
      started_at: null,
      paused_at: null,
    })
    .eq("id", task.id);
}
