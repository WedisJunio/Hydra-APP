"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Clock,
  CheckSquare,
  X,
  Search,
  LayoutGrid,
  List,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Sparkles,
  Filter,
  Folder,
  User as UserIcon,
  GripVertical,
  Inbox,
  PlayCircle,
  Trophy,
  MoveRight,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import {
  countBusinessDaysInclusive,
  dueDateFromBusinessDays,
  formatDate,
  formatDuration,
  getTodayLocalISO,
  isTaskCompletedLate,
  isTaskDelayed,
} from "@/lib/utils";
import { formatProjectDisplayName } from "@/lib/project-display";

// ─── Types ──────────────────────────────────────────────────────────────────

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  project_id: string;
  assigned_to: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  start_date: string | null;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
  time_spent_seconds: number;
  is_timer_running: boolean;
  projects?: {
    name: string;
    municipality?: string | null;
    state?: string | null;
  } | null;
  users?: { name: string } | null;
};

type Project = { id: string; name: string; municipality?: string | null; state?: string | null };
type User = { id: string; name: string };

type StatusKey = "pending" | "in_progress" | "completed";
type ViewMode = "kanban" | "list";
type StatusFilter = "all" | StatusKey;

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  StatusKey,
  { title: string; color: string; soft: string; fg: string; icon: React.ReactNode }
> = {
  pending: {
    title: "Pendente",
    color: "var(--warning)",
    soft: "var(--warning-soft)",
    fg: "var(--warning-fg)",
    icon: <Clock size={14} />,
  },
  in_progress: {
    title: "Em andamento",
    color: "var(--info)",
    soft: "var(--info-soft)",
    fg: "var(--info-fg)",
    icon: <Activity size={14} />,
  },
  completed: {
    title: "Concluída",
    color: "var(--success)",
    soft: "var(--success-soft)",
    fg: "var(--success-fg)",
    icon: <CheckCircle2 size={14} />,
  },
};

const KANBAN_ORDER: StatusKey[] = ["pending", "in_progress", "completed"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getStatusLabel(status: string) {
  return STATUS_CONFIG[status as StatusKey]?.title ?? status;
}

function getLiveSeconds(task: Task) {
  if (!task.is_timer_running || !task.started_at) {
    return task.time_spent_seconds || 0;
  }
  const startedAt = new Date(task.started_at).getTime();
  const runningSeconds = Math.max(Math.floor((Date.now() - startedAt) / 1000), 0);
  return (task.time_spent_seconds || 0) + runningSeconds;
}

function getDeadlineBadge(task: Task) {
  if (task.actual_completed_date && task.planned_due_date) {
    if (isTaskCompletedLate(task)) {
      return <Badge variant="danger">Concluída com atraso</Badge>;
    }
    return <Badge variant="success">No prazo</Badge>;
  }

  if (task.planned_due_date && task.status !== "completed" && isTaskDelayed(task)) {
    return <Badge variant="danger">Atrasada</Badge>;
  }

  return null;
}

function appendPauseReason(
  description: string | null,
  reason: string,
  pausedAtIso: string
) {
  const stamp = new Date(pausedAtIso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const line = `[Pausa ${stamp}] ${reason}`;
  const base = (description || "").trim();
  return base ? `${base}\n${line}` : line;
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  variant = "primary",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  variant?: "primary" | "success" | "warning" | "danger" | "purple" | "info";
  hint?: string;
}) {
  const colorMap: Record<typeof variant, string> = {
    primary: "var(--primary)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    purple: "#7C3AED",
    info: "var(--info)",
  } as const;
  const color = colorMap[variant];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: `color-mix(in srgb, ${color} 15%, transparent)`,
            color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--foreground)",
          lineHeight: 1.15,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="text-xs text-muted mt-1" style={{ fontWeight: 500 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
  color,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 999,
        border: `1px solid ${active ? color || "var(--primary)" : "var(--border)"}`,
        background: active
          ? color
            ? `color-mix(in srgb, ${color} 12%, transparent)`
            : "var(--primary-soft)"
          : "var(--surface)",
        color: active ? color || "var(--primary)" : "var(--muted-fg)",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.15s ease",
      }}
    >
      {color && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: color,
          }}
        />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          style={{
            padding: "1px 8px",
            borderRadius: 999,
            background: active
              ? color
                ? `color-mix(in srgb, ${color} 22%, transparent)`
                : "rgba(37, 99, 235, 0.18)"
              : "var(--surface-3)",
            color: active ? color || "var(--primary)" : "var(--muted-fg)",
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAssignedTo, setSelectedAssignedTo] = useState("");
  const [newEstimatedDays, setNewEstimatedDays] = useState("");
  const [creating, setCreating] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [onlyDelayed, setOnlyDelayed] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("kanban");

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedAssignedTo, setEditedAssignedTo] = useState("");
  const [editedEstimatedDays, setEditedEstimatedDays] = useState("");

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const [quickAddColumn, setQuickAddColumn] = useState<StatusKey | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddProjectId, setQuickAddProjectId] = useState("");
  const [quickAddCreating, setQuickAddCreating] = useState(false);

  // Dialog de pausa de tarefa (substitui window.prompt)
  const [pauseDialogTask, setPauseDialogTask] = useState<Task | null>(null);
  const [pauseReason, setPauseReason] = useState("");
  const [pauseSubmitting, setPauseSubmitting] = useState(false);

  const [, setClock] = useState(0);

  const hasRunningTimer = useMemo(
    () => tasks.some((task) => task.is_timer_running),
    [tasks]
  );

  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => {
      setClock((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  // ─── Loaders ─────────────────────────────────────────────────────────────

  async function loadTasks(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id, title, description, status, created_at, project_id, assigned_to, planned_due_date, actual_completed_date, start_date, started_at, paused_at, completed_at, time_spent_seconds, is_timer_running, projects(name, municipality, state), users:assigned_to(name)"
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar tarefas:", error.message);
      if (!silent) setLoading(false);
      return;
    }

    setTasks((data as unknown as Task[]) || []);
    if (!silent) setLoading(false);
  }

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("id, name, municipality, state")
      .order("created_at", { ascending: false });
    setProjects(data || []);
  }

  async function loadUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setUsers(data || []);
  }

  function canManageTask(task: Task) {
    if (task.assigned_to && currentProfileId && task.assigned_to === currentProfileId) {
      return true;
    }
    return (
      currentUserRole === "admin" ||
      currentUserRole === "coordinator" ||
      currentUserRole === "employee"
    );
  }

  // ─── CRUD handlers ───────────────────────────────────────────────────────

  /**
   * Garante que o responsavel pela tarefa, o criador, o lider, o coordenador
   * e o gerente do projeto estejam vinculados em project_members. Roda como
   * fallback no client (existe tambem um trigger no banco para o mesmo fim).
   */
  async function ensureTaskTeamMembership(
    projectId: string,
    assignedTo: string | null,
    createdBy: string
  ) {
    if (!projectId) return;
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("leader_id, manager_id, coordinator_id")
        .eq("id", projectId)
        .maybeSingle();

      type MemberRow = {
        project_id: string;
        user_id: string;
        role: string;
      };
      const rows: MemberRow[] = [];
      const seen = new Set<string>();
      const push = (userId: string | null | undefined, role: string) => {
        if (!userId || seen.has(userId)) return;
        seen.add(userId);
        rows.push({ project_id: projectId, user_id: userId, role });
      };

      push(assignedTo, "member");
      push(createdBy, "member");
      push(project?.leader_id ?? null, "leader");
      push(project?.coordinator_id ?? null, "coordinator");
      push(project?.manager_id ?? null, "manager");

      if (rows.length === 0) return;

      await supabase
        .from("project_members")
        .upsert(rows, { onConflict: "project_id,user_id", ignoreDuplicates: true });
    } catch {
      // best-effort: o trigger no banco e a fonte da verdade.
    }
  }

  /**
   * Recalcula projects.actual_end_date com base nas tarefas atuais.
   * - Todas concluidas -> grava a maior data de conclusao.
   * - Caso contrario   -> grava NULL.
   * Roda como fallback no client; no banco existe trigger equivalente.
   */
  async function recalcProjectActualEndDate(projectId: string | null | undefined) {
    if (!projectId) return;
    try {
      const { data: rows } = await supabase
        .from("tasks")
        .select("status, actual_completed_date, completed_at")
        .eq("project_id", projectId);

      const list = rows ?? [];
      const total = list.length;
      const completed = list.filter((t) => t.status === "completed");

      let nextEnd: string | null = null;
      if (total > 0 && completed.length === total) {
        const dates = completed
          .map((t) => {
            if (t.actual_completed_date) return t.actual_completed_date;
            if (t.completed_at) return String(t.completed_at).slice(0, 10);
            return null;
          })
          .filter((d): d is string => !!d);
        nextEnd =
          dates.length > 0
            ? dates.reduce((max, d) => (d > max ? d : max))
            : getTodayLocalISO();
      }

      await supabase
        .from("projects")
        .update({ actual_end_date: nextEnd })
        .eq("id", projectId);
    } catch {
      // ignora: trigger no banco trata o caso geral.
    }
  }

  async function handleCreateTask() {
    if (!newTaskTitle.trim() || !selectedProjectId) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Sessão inválida", "Entre novamente para criar tarefas.");
      return;
    }
    setCreating(true);

    const { error } = await supabase.from("tasks").insert({
      title: newTaskTitle,
      description: newTaskDescription,
      project_id: selectedProjectId,
      status: "pending",
      created_by: profile.id,
      assigned_to: selectedAssignedTo || null,
      planned_due_date:
        dueDateFromBusinessDays(getTodayLocalISO(), Number(newEstimatedDays)) || null,
      actual_completed_date: null,
      started_at: null,
      paused_at: null,
      completed_at: null,
      time_spent_seconds: 0,
      is_timer_running: false,
    });

    if (error) {
      showErrorToast("Não foi possível criar a tarefa", getSupabaseErrorMessage(error));
      setCreating(false);
      return;
    }

    await ensureTaskTeamMembership(
      selectedProjectId,
      selectedAssignedTo || null,
      profile.id
    );
    await recalcProjectActualEndDate(selectedProjectId);

    setNewTaskTitle("");
    setNewTaskDescription("");
    setSelectedProjectId("");
    setSelectedAssignedTo("");
    setNewEstimatedDays("");
    setShowNewTaskForm(false);
    await loadTasks({ silent: true });
    showSuccessToast("Tarefa criada", "A tarefa foi adicionada com sucesso.");
    setCreating(false);
  }

  async function handleQuickAdd(status: StatusKey) {
    if (!quickAddTitle.trim() || !quickAddProjectId) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Sessão inválida", "Entre novamente para criar tarefas.");
      return;
    }
    setQuickAddCreating(true);

    const { error } = await supabase.from("tasks").insert({
      title: quickAddTitle,
      description: "",
      project_id: quickAddProjectId,
      status,
      created_by: profile.id,
      assigned_to: null,
      planned_due_date: null,
      actual_completed_date: null,
      started_at: null,
      paused_at: null,
      completed_at: null,
      time_spent_seconds: 0,
      is_timer_running: false,
    });

    if (error) {
      showErrorToast("Não foi possível criar a tarefa", getSupabaseErrorMessage(error));
      setQuickAddCreating(false);
      return;
    }

    await ensureTaskTeamMembership(quickAddProjectId, null, profile.id);
    await recalcProjectActualEndDate(quickAddProjectId);

    setQuickAddTitle("");
    setQuickAddColumn(null);
    setQuickAddCreating(false);
    await loadTasks({ silent: true });
    showSuccessToast("Tarefa criada", "Adicionada direto na coluna.");
  }

  async function handleStartTimer(task: Task) {
    if (task.status === "completed") return;
    if (!canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode iniciar tarefas sob sua responsabilidade."
      );
      return;
    }

    // Regra de foco unico: cada responsavel so pode ter UMA tarefa em
    // andamento por vez. Antes de iniciar, conferimos se ha outra tarefa
    // rodando para o mesmo usuario (consultando o banco para garantir
    // consistencia mesmo se o estado local estiver dessincronizado).
    const ownerId = task.assigned_to ?? currentProfileId;
    if (ownerId) {
      const localRunning = tasks.find(
        (t) =>
          t.id !== task.id &&
          t.is_timer_running &&
          (t.assigned_to ?? null) === ownerId
      );
      if (localRunning) {
        showErrorToast(
          "Você já tem uma tarefa em andamento",
          `Pause "${localRunning.title}" antes de iniciar outra.`
        );
        return;
      }

      const { data: runningRows } = await supabase
        .from("tasks")
        .select("id, title")
        .eq("assigned_to", ownerId)
        .eq("is_timer_running", true)
        .neq("id", task.id)
        .limit(1);
      if (runningRows && runningRows.length > 0) {
        const other = runningRows[0] as { id: string; title: string };
        showErrorToast(
          "Você já tem uma tarefa em andamento",
          `Pause "${other.title}" antes de iniciar outra.`
        );
        await loadTasks({ silent: true });
        return;
      }
    }

    const previousTasks = tasks;
    const nowIso = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              started_at: nowIso,
              paused_at: null,
              is_timer_running: true,
              status: t.status === "pending" ? "in_progress" : t.status,
            }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        started_at: nowIso,
        paused_at: null,
        is_timer_running: true,
        status: task.status === "pending" ? "in_progress" : task.status,
      })
      .eq("id", task.id);
    if (error) {
      setTasks(previousTasks);
      showErrorToast(
        "Não foi possível iniciar o timer",
        getSupabaseErrorMessage(error)
      );
      return;
    }
    await loadTasks({ silent: true });
    showSuccessToast("Timer iniciado", `Produção iniciada em "${task.title}".`);
  }

  async function handlePauseTimer(task: Task, reason: string) {
    if (!task.is_timer_running || !task.started_at) return;
    if (!canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode pausar tarefas sob sua responsabilidade."
      );
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      showErrorToast("Motivo obrigatório", "Informe o motivo da pausa.");
      return;
    }
    const totalSeconds = getLiveSeconds(task);
    const previousTasks = tasks;
    const pausedIso = new Date().toISOString();
    const nextDescription = appendPauseReason(
      task.description,
      trimmedReason,
      pausedIso
    );

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              time_spent_seconds: totalSeconds,
              paused_at: pausedIso,
              started_at: null,
              is_timer_running: false,
              description: nextDescription,
            }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        time_spent_seconds: totalSeconds,
        paused_at: pausedIso,
        started_at: null,
        is_timer_running: false,
        description: nextDescription,
      })
      .eq("id", task.id);
    if (error) {
      setTasks(previousTasks);
      showErrorToast(
        "Não foi possível pausar o timer",
        getSupabaseErrorMessage(error)
      );
      return;
    }
    await loadTasks({ silent: true });
    showSuccessToast("Timer pausado", `Motivo: ${trimmedReason}`);
  }

  async function handleConfirmPauseDialog() {
    if (!pauseDialogTask) return;
    const reason = pauseReason.trim();
    if (!reason) {
      showErrorToast(
        "Motivo obrigatório",
        "Informe o motivo da pausa para continuar."
      );
      return;
    }
    setPauseSubmitting(true);
    await handlePauseTimer(pauseDialogTask, reason);
    setPauseSubmitting(false);
    setPauseDialogTask(null);
    setPauseReason("");
  }

  async function handleFinishTask(task: Task) {
    if (!canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode concluir tarefas sob sua responsabilidade."
      );
      return;
    }
    const totalSeconds = getLiveSeconds(task);
    const today = getTodayLocalISO();
    const completedIso = new Date().toISOString();
    const previousTasks = tasks;
    const nextActualCompleted = task.actual_completed_date || today;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: "completed",
              completed_at: completedIso,
              actual_completed_date: nextActualCompleted,
              time_spent_seconds: totalSeconds,
              started_at: null,
              paused_at: null,
              is_timer_running: false,
            }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        status: "completed",
        completed_at: completedIso,
        actual_completed_date: nextActualCompleted,
        time_spent_seconds: totalSeconds,
        started_at: null,
        paused_at: null,
        is_timer_running: false,
      })
      .eq("id", task.id);
    if (error) {
      setTasks(previousTasks);
      showErrorToast(
        "Não foi possível concluir a tarefa",
        getSupabaseErrorMessage(error)
      );
      return;
    }
    await recalcProjectActualEndDate(task.project_id);
    await loadTasks({ silent: true });
    showSuccessToast(
      "Tarefa concluída",
      `A tarefa "${task.title}" foi finalizada.`
    );
  }

  async function handleChangeStatus(task: Task, newStatus: string) {
    if (!canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode alterar tarefas sob sua responsabilidade."
      );
      return;
    }
    if (newStatus === "completed") {
      await handleFinishTask(task);
      return;
    }

    // Optimistic update — atualiza estado local antes do round-trip
    const previousTasks = tasks;
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: newStatus,
              actual_completed_date: null,
              completed_at: null,
              is_timer_running: false,
              started_at: null,
              paused_at: null,
            }
          : t
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        actual_completed_date: null,
        completed_at: null,
        is_timer_running: false,
        started_at: null,
        paused_at: null,
      })
      .eq("id", task.id);
    if (error) {
      // rollback
      setTasks(previousTasks);
      showErrorToast(
        "Não foi possível atualizar o status",
        getSupabaseErrorMessage(error)
      );
      return;
    }
    await recalcProjectActualEndDate(task.project_id);
    await loadTasks({ silent: true });
    showSuccessToast(
      "Status atualizado",
      `A tarefa agora está em "${getStatusLabel(newStatus)}".`
    );
  }

  async function handleDeleteTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (task && !canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode excluir tarefas sob sua responsabilidade."
      );
      return;
    }
    if (!window.confirm("Excluir esta tarefa?")) return;

    const previousTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) {
      setTasks(previousTasks);
      showErrorToast("Não foi possível excluir a tarefa", getSupabaseErrorMessage(error));
      return;
    }
    await recalcProjectActualEndDate(task?.project_id);
    showSuccessToast("Tarefa excluída", "A tarefa foi removida.");
  }

  function handleStartEdit(task: Task) {
    if (!canManageTask(task)) {
      showErrorToast(
        "Sem permissão",
        "Você só pode editar tarefas sob sua responsabilidade."
      );
      return;
    }
    setEditingTaskId(task.id);
    setEditedTitle(task.title);
    setEditedDescription(task.description || "");
    setEditedAssignedTo(task.assigned_to || "");
    const startBase = task.start_date || getTodayLocalISO();
    const estimated = task.planned_due_date
      ? countBusinessDaysInclusive(startBase, task.planned_due_date)
      : 0;
    setEditedEstimatedDays(estimated > 0 ? String(estimated) : "");
  }

  function handleCancelEdit() {
    setEditingTaskId(null);
  }

  async function handleSaveEdit(taskId: string) {
    if (!editedTitle.trim()) return;
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editedTitle,
        description: editedDescription,
        assigned_to: editedAssignedTo || null,
        planned_due_date:
          dueDateFromBusinessDays(
            tasks.find((task) => task.id === taskId)?.start_date || getTodayLocalISO(),
            Number(editedEstimatedDays)
          ) || null,
      })
      .eq("id", taskId);
    if (error) {
      showErrorToast("Não foi possível salvar a tarefa", getSupabaseErrorMessage(error));
      return;
    }

    const editedTask = tasks.find((task) => task.id === taskId);
    if (editedTask?.project_id) {
      await ensureTaskTeamMembership(
        editedTask.project_id,
        editedAssignedTo || null,
        currentProfileId ?? ""
      );
    }

    handleCancelEdit();
    await loadTasks({ silent: true });
    showSuccessToast("Tarefa atualizada", "As alterações foram salvas.");
  }

  function getNextStatus(currentStatus: string) {
    if (currentStatus === "pending") return "in_progress";
    if (currentStatus === "in_progress") return "completed";
    return "pending";
  }
  function getPreviousStatus(currentStatus: string) {
    if (currentStatus === "completed") return "in_progress";
    if (currentStatus === "in_progress") return "pending";
    return "completed";
  }

  function handleDragStart(taskId: string) {
    setDraggedTaskId(taskId);
  }
  async function handleDrop(newStatus: string) {
    if (!draggedTaskId) return;
    const task = tasks.find((item) => item.id === draggedTaskId);
    if (!task || task.status === newStatus) {
      setDraggedTaskId(null);
      setDragOverColumn(null);
      return;
    }
    await handleChangeStatus(task, newStatus);
    setDraggedTaskId(null);
    setDragOverColumn(null);
  }

  // ─── Derived data ────────────────────────────────────────────────────────

  const statusCounts = useMemo(() => {
    return {
      all: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const globalStats = useMemo(() => {
    const total = tasks.length;
    const completed = statusCounts.completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalSeconds = tasks.reduce((sum, t) => sum + getLiveSeconds(t), 0);
    return {
      total,
      completed,
      inProgress: statusCounts.in_progress,
      pending: statusCounts.pending,
      delayed: tasks.filter(isTaskDelayed).length,
      completionRate,
      totalSeconds,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (search.trim()) {
        const term = search.trim().toLowerCase();
        if (
          !task.title.toLowerCase().includes(term) &&
          !(task.description?.toLowerCase().includes(term))
        ) {
          return false;
        }
      }
      if (statusFilter !== "all" && task.status !== statusFilter) return false;
      if (projectFilter && task.project_id !== projectFilter) return false;
      if (responsibleFilter && task.assigned_to !== responsibleFilter) return false;
      if (onlyDelayed && !isTaskDelayed(task)) return false;
      return true;
    });
  }, [tasks, search, statusFilter, projectFilter, responsibleFilter, onlyDelayed]);

  useEffect(() => {
    loadTasks();
    loadProjects();
    loadUsers();
    getCurrentProfile().then((profile) => {
      setCurrentProfileId(profile?.id || null);
      setCurrentUserRole(profile?.role || null);
    });
  }, []);

  const hasActiveFilter = !!(
    search ||
    statusFilter !== "all" ||
    projectFilter ||
    responsibleFilter ||
    onlyDelayed
  );

  function clearAllFilters() {
    setSearch("");
    setStatusFilter("all");
    setProjectFilter("");
    setResponsibleFilter("");
    setOnlyDelayed(false);
  }

  // ─── Renderizadores ──────────────────────────────────────────────────────

  function renderTaskCard(task: Task, compact = false) {
    const liveSeconds = getLiveSeconds(task);
    const isEditing = editingTaskId === task.id;
    const cfg = STATUS_CONFIG[task.status as StatusKey] || STATUS_CONFIG.pending;
    const deadlineBadge = getDeadlineBadge(task);
    const isDelayed = isTaskDelayed(task);

    if (isEditing) {
      return (
        <div
          key={task.id}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--primary)",
            borderRadius: 12,
            padding: 14,
            boxShadow: "0 0 0 3px var(--primary-soft)",
          }}
        >
          <div className="flex flex-col gap-2">
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              placeholder="Título"
            />
            <Textarea
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              placeholder="Descrição"
              style={{ minHeight: 70 }}
            />
            <Select
              value={editedAssignedTo}
              onChange={(e) => setEditedAssignedTo(e.target.value)}
            >
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
            <Field label="Dias previstos (8h/dia)">
              <Input
                type="number"
                min={1}
                step={1}
                value={editedEstimatedDays}
                onChange={(e) => setEditedEstimatedDays(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleSaveEdit(task.id)}>
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        draggable
        onDragStart={() => handleDragStart(task.id)}
        onDragEnd={() => setDraggedTaskId(null)}
        className="task-card-hover"
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          cursor: "grab",
          opacity: draggedTaskId === task.id ? 0.45 : 1,
          transform:
            draggedTaskId === task.id ? "scale(0.98)" : undefined,
          boxShadow:
            draggedTaskId === task.id
              ? "0 18px 38px rgba(2,6,23,0.25)"
              : "var(--shadow-xs)",
          transition:
            "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease",
        }}
      >
        {/* Faixa lateral colorida de status */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 3,
            height: "100%",
            background: cfg.color,
          }}
        />

        {/* Drag handle no canto superior direito (aparece no hover) */}
        <div
          className="task-card-handle"
          aria-hidden
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            color: "var(--muted-fg)",
            opacity: 0.4,
            cursor: "grab",
            pointerEvents: "none",
            transition: "opacity 120ms ease",
          }}
        >
          <GripVertical size={14} />
        </div>

        {/* Linha de progresso animada no topo quando timer ativo */}
        {task.is_timer_running && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${"var(--success)"}, transparent)`,
              backgroundSize: "200% 100%",
              animation: "shimmer 2.4s linear infinite",
            }}
          />
        )}

        <div style={{ padding: 14, paddingLeft: 16 }}>
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "var(--foreground)",
                lineHeight: 1.3,
                flex: 1,
                margin: 0,
                letterSpacing: "-0.005em",
              }}
            >
              {task.title}
            </h3>
            {deadlineBadge}
          </div>

          {/* Descrição */}
          {task.description && !compact && (
            <p
              className="text-sm text-muted mb-3"
              style={{ lineHeight: 1.5, marginTop: 0 }}
            >
              {task.description.length > 110
                ? task.description.slice(0, 110) + "…"
                : task.description}
            </p>
          )}

          {/* Meta info */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-xs"
              style={{
                padding: "3px 8px",
                borderRadius: 999,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                color: "var(--muted-fg)",
                fontWeight: 500,
              }}
            >
              <Folder size={11} />
              {task.projects ? formatProjectDisplayName(task.projects) : "Sem projeto"}
            </span>

            {task.users?.name ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs"
                style={{
                  padding: "2px 8px 2px 2px",
                  borderRadius: 999,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontWeight: 500,
                }}
              >
                <Avatar name={task.users.name} size="sm" />
                {task.users.name}
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "var(--warning-soft)",
                  color: "var(--warning-fg)",
                  fontWeight: 600,
                }}
              >
                <UserIcon size={11} />
                Sem responsável
              </span>
            )}

            {task.planned_due_date && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: isDelayed
                    ? "var(--danger-soft)"
                    : "var(--surface-2)",
                  border: `1px solid ${
                    isDelayed
                      ? "color-mix(in srgb, var(--danger) 30%, transparent)"
                      : "var(--border)"
                  }`,
                  color: isDelayed ? "var(--danger-fg)" : "var(--muted-fg)",
                  fontWeight: 500,
                }}
              >
                <CalendarDays size={11} />
                {formatDate(task.planned_due_date)}
              </span>
            )}
          </div>

          {/* Timer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 10,
              marginBottom: 12,
              background: task.is_timer_running
                ? "linear-gradient(90deg, var(--success-soft), color-mix(in srgb, var(--success) 8%, transparent))"
                : "var(--surface-2)",
              border: task.is_timer_running
                ? "1px solid color-mix(in srgb, var(--success) 35%, transparent)"
                : "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-2">
              {task.is_timer_running ? (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--success)",
                    animation: "pulse 1.4s ease-in-out infinite",
                  }}
                />
              ) : (
                <Clock size={13} style={{ color: "var(--muted-fg)" }} />
              )}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: task.is_timer_running
                    ? "var(--success-fg)"
                    : "var(--muted-fg)",
                }}
              >
                {task.is_timer_running ? "Produzindo" : "Tempo total"}
              </span>
            </div>
            <strong
              style={{
                fontSize: 16,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: task.is_timer_running
                  ? "var(--success-fg)"
                  : "var(--foreground)",
              }}
            >
              {formatDuration(liveSeconds)}
            </strong>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {!task.is_timer_running && task.status !== "completed" && (() => {
                const ownerId = task.assigned_to ?? currentProfileId;
                const blockingTask = ownerId
                  ? tasks.find(
                      (t) =>
                        t.id !== task.id &&
                        t.is_timer_running &&
                        (t.assigned_to ?? null) === ownerId
                    )
                  : null;
                const blocked = !!blockingTask;
                return (
                  <Button
                    size="sm"
                    leftIcon={<Play size={12} />}
                    onClick={() => handleStartTimer(task)}
                    disabled={blocked}
                    title={
                      blocked
                        ? `Pause "${blockingTask?.title}" antes de iniciar outra.`
                        : undefined
                    }
                  >
                    Iniciar
                  </Button>
                );
              })()}
              {task.is_timer_running && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Pause size={12} />}
                  onClick={() => {
                    setPauseDialogTask(task);
                    setPauseReason("");
                  }}
                >
                  Pausar
                </Button>
              )}
              {task.status !== "completed" && (
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Check size={12} />}
                  onClick={() => handleFinishTask(task)}
                >
                  Concluir
                </Button>
              )}
            </div>

            <div className="flex items-center gap-0.5">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  handleChangeStatus(task, getPreviousStatus(task.status))
                }
                title="Voltar status"
              >
                <ChevronLeft size={13} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() =>
                  handleChangeStatus(task, getNextStatus(task.status))
                }
                title="Avançar status"
              >
                <ChevronRight size={13} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleStartEdit(task)}
                title="Editar"
              >
                <Pencil size={13} />
              </Button>
              <Button
                size="icon-sm"
                variant="danger-ghost"
                onClick={() => handleDeleteTask(task.id)}
                title="Excluir"
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderKanban() {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))",
          gap: 14,
          alignItems: "start",
        }}
      >
        {KANBAN_ORDER.map((statusKey) => {
          const cfg = STATUS_CONFIG[statusKey];
          const columnTasks = filteredTasks.filter(
            (t) => t.status === statusKey
          );
          const isHovered = dragOverColumn === statusKey;

          // Métricas extras da coluna
          const colTotalSeconds = columnTasks.reduce(
            (s, t) => s + getLiveSeconds(t),
            0
          );
          const colDelayed = columnTasks.filter(isTaskDelayed).length;
          const colRunning = columnTasks.some((t) => t.is_timer_running);

          // Ícone grande do empty state por coluna
          const emptyIcon =
            statusKey === "pending" ? (
              <Inbox size={28} />
            ) : statusKey === "in_progress" ? (
              <PlayCircle size={28} />
            ) : (
              <Trophy size={28} />
            );

          const emptyText =
            statusKey === "pending"
              ? "Nada na fila"
              : statusKey === "in_progress"
              ? "Nada rolando agora"
              : "Nenhuma conclusão ainda";

          const isQuickAddOpen = quickAddColumn === statusKey;

          return (
            <div
              key={statusKey}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(statusKey);
              }}
              onDragLeave={(e) => {
                // Só limpa se realmente saiu do container (não de um filho)
                const related = e.relatedTarget as Node | null;
                if (
                  related &&
                  e.currentTarget.contains(related)
                ) {
                  return;
                }
                setDragOverColumn(null);
              }}
              onDrop={() => handleDrop(statusKey)}
              style={{
                background: isHovered
                  ? `color-mix(in srgb, ${cfg.color} 6%, var(--surface-2))`
                  : "var(--surface-2)",
                borderRadius: 16,
                border: isHovered
                  ? `2px dashed ${cfg.color}`
                  : "1px solid var(--border)",
                minHeight: 380,
                transition: "background 150ms ease, border-color 150ms ease",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Column header — gradiente sutil */}
              <div
                style={{
                  borderTop: `3px solid ${cfg.color}`,
                  padding: "12px 14px",
                  background: `linear-gradient(180deg, ${cfg.soft} 0%, var(--surface) 100%)`,
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "var(--surface)",
                        color: cfg.fg,
                        border: `1px solid ${cfg.color}40`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {cfg.icon}
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--foreground)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {cfg.title}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: cfg.color,
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {columnTasks.length}
                    </span>
                    {colRunning && (
                      <span
                        title="Há um timer ativo nesta coluna"
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: "var(--success)",
                          animation: "pulse 1.4s ease-in-out infinite",
                        }}
                      />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddColumn(isQuickAddOpen ? null : statusKey);
                      setQuickAddTitle("");
                    }}
                    title="Adicionar tarefa nesta coluna"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 7,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--muted-fg)",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = cfg.fg;
                      e.currentTarget.style.borderColor = cfg.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--muted-fg)";
                      e.currentTarget.style.borderColor = "var(--border)";
                    }}
                  >
                    {isQuickAddOpen ? <X size={13} /> : <Plus size={14} />}
                  </button>
                </div>

                {/* Sub-stats da coluna */}
                {columnTasks.length > 0 && (
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    {colTotalSeconds > 0 && (
                      <span
                        className="inline-flex items-center gap-1"
                        style={{ color: "var(--muted-fg)", fontWeight: 500 }}
                      >
                        <Clock size={11} />
                        {formatDuration(colTotalSeconds)}
                      </span>
                    )}
                    {colDelayed > 0 && (
                      <span
                        className="inline-flex items-center gap-1"
                        style={{
                          color: "var(--danger)",
                          fontWeight: 600,
                        }}
                      >
                        <AlertTriangle size={11} />
                        {colDelayed} atrasada
                        {colDelayed === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Quick add */}
              {isQuickAddOpen && (
                <div
                  style={{
                    padding: 10,
                    background: "var(--surface)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div className="flex flex-col gap-2">
                    <Input
                      autoFocus
                      placeholder="Nome da tarefa…"
                      value={quickAddTitle}
                      onChange={(e) => setQuickAddTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleQuickAdd(statusKey);
                        }
                        if (e.key === "Escape") {
                          setQuickAddColumn(null);
                          setQuickAddTitle("");
                        }
                      }}
                    />
                    <Select
                      value={quickAddProjectId}
                      onChange={(e) => setQuickAddProjectId(e.target.value)}
                    >
                      <option value="">Selecione o projeto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatProjectDisplayName(p)}
                        </option>
                      ))}
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        loading={quickAddCreating}
                        disabled={
                          !quickAddTitle.trim() || !quickAddProjectId
                        }
                        onClick={() => handleQuickAdd(statusKey)}
                      >
                        Adicionar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setQuickAddColumn(null);
                          setQuickAddTitle("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Column body */}
              <div
                className="kanban-column-body flex flex-col gap-2"
                style={{
                  padding: 10,
                  flex: 1,
                  maxHeight: "calc(100vh - 380px)",
                  minHeight: 200,
                  overflowY: "auto",
                }}
              >
                {columnTasks.map((task) => renderTaskCard(task))}

                {columnTasks.length === 0 && (
                  <div
                    style={{
                      padding: "32px 18px",
                      borderRadius: 12,
                      border: `2px dashed ${
                        isHovered ? cfg.color : "var(--border)"
                      }`,
                      background: isHovered
                        ? `color-mix(in srgb, ${cfg.color} 8%, transparent)`
                        : "transparent",
                      color: "var(--muted-fg)",
                      fontSize: 13,
                      textAlign: "center",
                      lineHeight: 1.5,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isHovered ? (
                      <>
                        <MoveRight
                          size={28}
                          style={{ color: cfg.color }}
                        />
                        <strong
                          style={{ color: cfg.fg, fontSize: 13 }}
                        >
                          Solte aqui pra mover
                        </strong>
                      </>
                    ) : (
                      <>
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 14,
                            background: cfg.soft,
                            color: cfg.fg,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: 0.7,
                          }}
                        >
                          {emptyIcon}
                        </div>
                        <div
                          className="font-semibold"
                          style={{
                            color: "var(--foreground)",
                            fontSize: 13,
                          }}
                        >
                          {emptyText}
                        </div>
                        <div className="text-xs">
                          Arraste tarefas pra cá ou{" "}
                          <button
                            type="button"
                            onClick={() => setQuickAddColumn(statusKey)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: cfg.fg,
                              fontWeight: 600,
                              textDecoration: "underline",
                            }}
                          >
                            criar nova
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderList() {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
          gap: 12,
        }}
      >
        {filteredTasks.map((task) => renderTaskCard(task, true))}
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Tarefas"
        description="Controle de produção com cronômetro, datas e responsáveis."
        actions={
          <Button
            leftIcon={<Plus size={16} />}
            onClick={() => setShowNewTaskForm((v) => !v)}
          >
            {showNewTaskForm ? "Fechar" : "Nova tarefa"}
          </Button>
        }
      />

      {/* ─── Top stats ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <StatTile
          label="Total de tarefas"
          value={globalStats.total}
          icon={<CheckSquare size={18} />}
          variant="primary"
          hint={`${globalStats.pending} pendentes`}
        />
        <StatTile
          label="Em andamento"
          value={globalStats.inProgress}
          icon={<Activity size={18} />}
          variant="info"
          hint={hasRunningTimer ? "Timer ativo agora" : undefined}
        />
        <StatTile
          label="Concluídas"
          value={globalStats.completed}
          icon={<CheckCircle2 size={18} />}
          variant="success"
          hint={`${globalStats.completionRate}% de conclusão`}
        />
        <StatTile
          label="Em atraso"
          value={globalStats.delayed}
          icon={<AlertTriangle size={18} />}
          variant={globalStats.delayed > 0 ? "danger" : "success"}
          hint={
            globalStats.delayed > 0
              ? `${Math.round(
                  (globalStats.delayed / Math.max(globalStats.total, 1)) * 100
                )}% do total`
              : "Tudo no prazo"
          }
        />
      </div>

      {/* ─── Form de nova tarefa ─────────────────────────────── */}
      {showNewTaskForm && (
        <Card className="mb-4" padded={false}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              background:
                "linear-gradient(90deg, var(--primary-soft), transparent)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--primary-soft)",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <div className="card-title">Nova tarefa</div>
              <p className="text-xs text-muted mt-0.5">
                Defina título, projeto e prazo em dias úteis
              </p>
            </div>
          </div>
          <div className="card-padded">
            <div className="flex flex-col gap-3">
              <Field label="Título da tarefa">
                <Input
                  placeholder="Ex.: Cálculo estrutural — pavimento térreo"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                />
              </Field>
              <Field label="Descrição">
                <Textarea
                  placeholder="Detalhes, escopo, observações..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                />
              </Field>
              <div className="grid-2">
                <Field label="Projeto">
                  <Select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    <option value="">Selecione um projeto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {formatProjectDisplayName(project)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Responsável">
                  <Select
                    value={selectedAssignedTo}
                    onChange={(e) => setSelectedAssignedTo(e.target.value)}
                  >
                    <option value="">Selecione o responsável</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Dias previstos (8h/dia)">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={newEstimatedDays}
                  onChange={(e) => setNewEstimatedDays(e.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateTask}
                  loading={creating}
                  disabled={!newTaskTitle.trim() || !selectedProjectId}
                >
                  Criar tarefa
                </Button>
                <Button variant="ghost" onClick={() => setShowNewTaskForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Toolbar ────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-3 mb-4"
        style={{
          padding: 12,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            position: "relative",
            flex: "1 1 240px",
            minWidth: 180,
          }}
        >
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--muted-fg)",
              pointerEvents: "none",
            }}
          />
          <Input
            placeholder="Buscar tarefa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip
            active={statusFilter === "all"}
            label="Todas"
            count={statusCounts.all}
            onClick={() => setStatusFilter("all")}
          />
          <FilterChip
            active={statusFilter === "pending"}
            label="Pendentes"
            count={statusCounts.pending}
            onClick={() => setStatusFilter("pending")}
            color={STATUS_CONFIG.pending.color}
          />
          <FilterChip
            active={statusFilter === "in_progress"}
            label="Em andamento"
            count={statusCounts.in_progress}
            onClick={() => setStatusFilter("in_progress")}
            color={STATUS_CONFIG.in_progress.color}
          />
          <FilterChip
            active={statusFilter === "completed"}
            label="Concluídas"
            count={statusCounts.completed}
            onClick={() => setStatusFilter("completed")}
            color={STATUS_CONFIG.completed.color}
          />
          <FilterChip
            active={onlyDelayed}
            label="Atrasadas"
            count={globalStats.delayed}
            onClick={() => setOnlyDelayed((v) => !v)}
            color="var(--danger)"
          />
        </div>

        <div
          className="flex items-center gap-2"
          style={{ borderLeft: "1px solid var(--border)", paddingLeft: 10 }}
        >
          <Filter size={14} className="text-muted" />
          <Select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            style={{ minWidth: 160, width: "auto" }}
          >
            <option value="">Todos os projetos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {formatProjectDisplayName(project)}
              </option>
            ))}
          </Select>
          <Select
            value={responsibleFilter}
            onChange={(e) => setResponsibleFilter(e.target.value)}
            style={{ minWidth: 160, width: "auto" }}
          >
            <option value="">Todos responsáveis</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
          {hasActiveFilter && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={13} />}
              onClick={clearAllFilters}
            >
              Limpar
            </Button>
          )}
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-md"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: viewMode === "kanban" ? "var(--surface)" : "transparent",
              color:
                viewMode === "kanban" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: viewMode === "kanban" ? "var(--shadow-sm)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <LayoutGrid size={13} />
            Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: viewMode === "list" ? "var(--surface)" : "transparent",
              color: viewMode === "list" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: viewMode === "list" ? "var(--shadow-sm)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <List size={13} />
            Lista
          </button>
        </div>
      </div>

      {/* ─── Conteúdo ────────────────────────────────────────────── */}
      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
          }}
        >
          <SkeletonCard height={280} />
          <SkeletonCard height={280} />
          <SkeletonCard height={280} />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={22} />}
          title="Nenhuma tarefa ainda"
          description="Crie sua primeira tarefa pra começar a registrar produção."
          action={
            <Button leftIcon={<Plus size={16} />} onClick={() => setShowNewTaskForm(true)}>
              Nova tarefa
            </Button>
          }
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Nenhuma tarefa nos filtros"
          description="Tente outro termo ou limpe os filtros pra ver todas."
          action={
            <Button variant="ghost" onClick={clearAllFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : viewMode === "kanban" ? (
        renderKanban()
      ) : (
        renderList()
      )}

      {/* ─── Footer summary ───────────────────────────────────── */}
      {!loading && filteredTasks.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 flex-wrap mt-4 text-xs text-muted"
          style={{ paddingInline: 4 }}
        >
          <span className="inline-flex items-center gap-1">
            <Activity size={12} />
            Mostrando <strong>{filteredTasks.length}</strong> de{" "}
            <strong>{tasks.length}</strong> tarefas
          </span>
          {globalStats.totalSeconds > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              Tempo total produzido:{" "}
              <strong>{formatDuration(globalStats.totalSeconds)}</strong>
            </span>
          )}
        </div>
      )}

      <PauseTaskDialog
        task={pauseDialogTask}
        reason={pauseReason}
        onChangeReason={setPauseReason}
        onCancel={() => {
          if (pauseSubmitting) return;
          setPauseDialogTask(null);
          setPauseReason("");
        }}
        onConfirm={handleConfirmPauseDialog}
        submitting={pauseSubmitting}
        elapsedSeconds={
          pauseDialogTask ? getLiveSeconds(pauseDialogTask) : 0
        }
      />
    </div>
  );
}

// ─── Dialog: pausar tarefa ───────────────────────────────────────────────────

const PAUSE_PRESETS: { label: string; value: string; emoji: string }[] = [
  { label: "Reunião", value: "Reunião", emoji: "📞" },
  { label: "Almoço", value: "Pausa para almoço", emoji: "🍽️" },
  { label: "Café/lanche", value: "Pausa para café", emoji: "☕" },
  { label: "Outra demanda", value: "Atendendo outra demanda", emoji: "🔀" },
  { label: "Aguardando info", value: "Aguardando informações", emoji: "⏳" },
  { label: "Pausa pessoal", value: "Pausa pessoal", emoji: "🧘" },
  { label: "Fim do expediente", value: "Fim do expediente", emoji: "🏠" },
];

function PauseTaskDialog({
  task,
  reason,
  onChangeReason,
  onCancel,
  onConfirm,
  submitting,
  elapsedSeconds,
}: {
  task: Task | null;
  reason: string;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  elapsedSeconds: number;
}) {
  useEffect(() => {
    if (!task) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onCancel, onConfirm]);

  if (!task) return null;

  const trimmedLength = reason.trim().length;
  const canConfirm = trimmedLength > 0 && !submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-dialog-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        padding: 16,
        animation: "fadeIn 120ms ease-out",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--background)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          width: "100%",
          maxWidth: 480,
          padding: 0,
          overflow: "hidden",
          animation: "popIn 160ms ease-out",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px 12px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(234, 88, 12, 0.18))",
              color: "#d97706",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Pause size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              id="pause-dialog-title"
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "var(--foreground)",
                lineHeight: 1.3,
              }}
            >
              Pausar tarefa
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12,
                color: "var(--muted-fg)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {task.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Fechar"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted-fg)",
              cursor: submitting ? "not-allowed" : "pointer",
              padding: 4,
              borderRadius: 6,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tempo decorrido */}
        <div
          style={{
            padding: "10px 20px",
            background:
              "linear-gradient(180deg, rgba(99, 102, 241, 0.06), transparent)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--muted-fg)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <Clock size={13} />
          Tempo registrado até agora:{" "}
          <strong style={{ color: "var(--foreground)", marginLeft: 2 }}>
            {formatDuration(elapsedSeconds)}
          </strong>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--foreground)",
              marginBottom: 6,
            }}
          >
            Motivo da pausa
          </label>
          <p
            style={{
              fontSize: 11,
              color: "var(--muted-fg)",
              margin: "0 0 10px",
            }}
          >
            Selecione um motivo rápido ou descreva nos detalhes abaixo. O
            registro será anexado ao histórico da tarefa.
          </p>

          {/* Presets */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 12,
            }}
          >
            {PAUSE_PRESETS.map((preset) => {
              const active = reason.trim() === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onChangeReason(preset.value)}
                  disabled={submitting}
                  style={{
                    border: active
                      ? "1px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: active
                      ? "color-mix(in oklab, var(--primary) 12%, transparent)"
                      : "var(--surface)",
                    color: active ? "var(--primary)" : "var(--foreground)",
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 120ms ease",
                  }}
                >
                  <span aria-hidden>{preset.emoji}</span>
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Textarea */}
          <Textarea
            value={reason}
            onChange={(e) => onChangeReason(e.target.value)}
            placeholder="Descreva o motivo (ex.: indo em uma reunião urgente com o cliente)"
            rows={3}
            autoFocus
            disabled={submitting}
            style={{ resize: "vertical", minHeight: 70 }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--muted-fg)",
              marginTop: 4,
            }}
          >
            <span>
              {trimmedLength === 0
                ? "Informe o motivo para pausar"
                : `${trimmedLength} caractere${trimmedLength === 1 ? "" : "s"}`}
            </span>
            <span style={{ opacity: 0.7 }}>Enter + Ctrl/Cmd para confirmar</span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px 16px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            borderTop: "1px solid var(--border)",
            background: "var(--surface)",
          }}
        >
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            leftIcon={<Pause size={14} />}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            {submitting ? "Pausando..." : "Pausar tarefa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
