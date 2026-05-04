"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  UserPlus,
  X,
  FolderKanban,
  FileDown,
  Crown,
  Users as UsersIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Search,
  LayoutGrid,
  List,
  CalendarDays,
  Sparkles,
  Activity,
  TrendingUp,
  Droplets,
  BarChart3,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage } from "@/lib/supabase/errors";
import {
  canCreateProject,
  canEditProjectShell,
  isNarrowProjetista,
} from "@/lib/permissions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatSeconds, isTaskDelayed } from "@/lib/utils";
import { generateProjectDashboardPdf } from "@/lib/project-report-pdf";
import {
  DashboardDisciplina,
  getDisciplineIcon,
  getDisciplineLabel,
  PeriodFilter,
  getLiveSeconds as getDashLiveSeconds,
} from "@/components/dashboard/engine";
import SaneamentoListPage from "@/app/(app)/saneamento/page";
import type {
  Approval,
  Phase,
  Project as DashProject,
  Task as DashTask,
  PeriodKey,
} from "@/components/dashboard/engine";

// ─── Types ───────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  name: string;
  discipline?: string | null;
  manager_id: string | null;
  coordinator_id: string | null;
  leader_id: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  created_at: string;
};

type User = {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

type ProjectMember = {
  project_id: string;
  user_id: string;
  role: string;
  users?: User | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assigned_to: string | null;
  created_by?: string | null;
  planned_due_date: string | null;
  actual_completed_date: string | null;
  completed_at: string | null;
  created_at: string | null;
  time_spent_seconds: number;
  is_timer_running: boolean;
  started_at: string | null;
};

type RiskKey = "green" | "yellow" | "red";

type RiskFilter = "all" | RiskKey;

type ViewMode = "grid" | "list";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLiveSeconds(task: Task) {
  if (!task.is_timer_running || !task.started_at) return task.time_spent_seconds || 0;
  const started = new Date(task.started_at).getTime();
  const diff = Math.max(Math.floor((Date.now() - started) / 1000), 0);
  return (task.time_spent_seconds || 0) + diff;
}

function getRoleLabel(role: string | null | undefined) {
  if (role === "manager") return "Gerência";
  if (role === "coordinator") return "Coordenador";
  if (role === "leader") return "Líder";
  if (role === "admin") return "Administrador";
  if (role === "projetista_lider") return "Projetista líder";
  if (role === "projetista" || role === "employee") return "Projetista";
  if (role === "member") return "Membro";
  return role || "Membro";
}

function formatBRDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const RISK_CONFIG: Record<
  RiskKey,
  { label: string; color: string; soft: string; fg: string }
> = {
  green: {
    label: "Saudável",
    color: "var(--success)",
    soft: "var(--success-soft)",
    fg: "var(--success-fg)",
  },
  yellow: {
    label: "Atenção",
    color: "var(--warning)",
    soft: "var(--warning-soft)",
    fg: "var(--warning-fg)",
  },
  red: {
    label: "Alto risco",
    color: "var(--danger)",
    soft: "var(--danger-soft)",
    fg: "var(--danger-fg)",
  },
};

// ─── Sub-componentes ─────────────────────────────────────────────────────────

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

function ProjectDateChip({
  icon,
  label,
  value,
  tone = "muted",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "muted" | "success" | "danger" | "warning";
}) {
  const palette: Record<
    NonNullable<"muted" | "success" | "danger" | "warning">,
    { bg: string; border: string; iconBg: string; iconFg: string; valueColor: string }
  > = {
    muted: {
      bg: "var(--surface-2)",
      border: "var(--border)",
      iconBg: "var(--surface-3)",
      iconFg: "var(--muted-fg)",
      valueColor: "var(--foreground)",
    },
    success: {
      bg: "var(--success-soft)",
      border: "color-mix(in srgb, var(--success) 25%, transparent)",
      iconBg: "color-mix(in srgb, var(--success) 18%, transparent)",
      iconFg: "var(--success)",
      valueColor: "var(--success-fg)",
    },
    danger: {
      bg: "var(--danger-soft)",
      border: "color-mix(in srgb, var(--danger) 25%, transparent)",
      iconBg: "color-mix(in srgb, var(--danger) 18%, transparent)",
      iconFg: "var(--danger)",
      valueColor: "var(--danger-fg)",
    },
    warning: {
      bg: "var(--warning-soft)",
      border: "color-mix(in srgb, var(--warning) 25%, transparent)",
      iconBg: "color-mix(in srgb, var(--warning) 18%, transparent)",
      iconFg: "var(--warning)",
      valueColor: "var(--warning-fg)",
    },
  };
  const style = palette[tone];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 10,
        background: style.bg,
        border: `1px solid ${style.border}`,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 7,
          background: style.iconBg,
          color: style.iconFg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0, lineHeight: 1.15 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--muted-fg)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: style.valueColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function AvatarStack({
  users,
  max = 4,
}: {
  users: { id: string; name: string }[];
  max?: number;
}) {
  const visible = users.slice(0, max);
  const rest = Math.max(users.length - max, 0);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {visible.map((u, i) => (
        <div
          key={u.id}
          style={{
            marginLeft: i === 0 ? 0 : -10,
            border: "2px solid var(--surface)",
            borderRadius: 999,
            display: "inline-flex",
          }}
        >
          <Avatar name={u.name} size="sm" />
        </div>
      ))}
      {rest > 0 && (
        <div
          style={{
            marginLeft: -10,
            width: 30,
            height: 30,
            borderRadius: 999,
            border: "2px solid var(--surface)",
            background: "var(--surface-3)",
            color: "var(--muted-fg)",
            fontSize: 11,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +{rest}
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
  count: number;
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
    </button>
  );
}

// ─── Página principal ───────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newPlannedEndDate, setNewPlannedEndDate] = useState("");
  const [newActualEndDate, setNewActualEndDate] = useState("");
  const [newManagerId, setNewManagerId] = useState("");
  const [newCoordinatorId, setNewCoordinatorId] = useState("");
  const [newLeaderId, setNewLeaderId] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedProjectName, setEditedProjectName] = useState("");
  const [editedPlannedEndDate, setEditedPlannedEndDate] = useState("");
  const [editedActualEndDate, setEditedActualEndDate] = useState("");
  const [editedManagerId, setEditedManagerId] = useState("");
  const [editedCoordinatorId, setEditedCoordinatorId] = useState("");
  const [editedLeaderId, setEditedLeaderId] = useState("");

  const [memberProjectId, setMemberProjectId] = useState<string | null>(null);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("member");

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [, setClock] = useState(0);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [activeProjectsTab, setActiveProjectsTab] = useState<"todos" | string>("todos");
  const [activeSaneamentoView, setActiveSaneamentoView] = useState<"dashboard" | "portfolio">("dashboard");

  const projetistaSomenteTarefas = isNarrowProjetista(myRole);
  const podeCriarProjeto = canCreateProject(myRole);
  const podeEditarProjeto = canEditProjectShell(myRole);

  const hasRunningTimer = useMemo(
    () => tasks.some((task) => task.is_timer_running),
    [tasks]
  );

  useEffect(() => {
    getCurrentProfile().then((p) => setMyRole(p?.role ?? null));
  }, []);

  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setClock((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select(
        "id, name, discipline, manager_id, coordinator_id, leader_id, planned_end_date, actual_end_date, created_at"
      )
      .order("created_at", { ascending: false });
    setProjects((data as Project[]) || []);
  }

  async function loadUsers() {
    const { data } = await supabase
      .from("users")
      .select("id, name, email, role")
      .eq("is_active", true)
      .order("name", { ascending: true });
    setUsers((data as User[]) || []);
  }

  async function loadMembers() {
    const { data } = await supabase.from("project_members").select(`
      project_id,
      user_id,
      role,
      users:user_id (
        id, name, email, role
      )
    `);
    setMembers((data as unknown as ProjectMember[]) || []);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select(
        "id, title, status, project_id, assigned_to, created_by, planned_due_date, actual_completed_date, completed_at, created_at, time_spent_seconds, is_timer_running, started_at"
      );
    setTasks((data as Task[]) || []);
  }

  async function loadApprovals() {
    const { data } = await supabase
      .from("external_approvals")
      .select("id, project_id, status, expected_response_date");
    setApprovals((data as Approval[]) || []);
  }

  async function loadPhases() {
    const { data } = await supabase
      .from("project_phases")
      .select("id, project_id, status");
    setPhases((data as Phase[]) || []);
  }

  async function reloadAll(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    await Promise.all([loadProjects(), loadUsers(), loadMembers(), loadTasks(), loadApprovals(), loadPhases()]);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    reloadAll();
  }, []);

  function getUserName(id: string | null) {
    return users.find((user) => user.id === id)?.name || "—";
  }

  function getProjectMembers(projectId: string) {
    return members.filter((member) => member.project_id === projectId);
  }

  function getProjectTasks(projectId: string) {
    return tasks.filter((task) => task.project_id === projectId);
  }

  function getUserTasksInProject(projectId: string, userId: string) {
    return tasks.filter(
      (task) => task.project_id === projectId && task.assigned_to === userId
    );
  }

  function getProjectStats(project: Project) {
    const projectTasks = getProjectTasks(project.id);
    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((task) => task.status === "completed").length;
    const inProgressTasks = projectTasks.filter((task) => task.status === "in_progress").length;
    const delayedTasks = projectTasks.filter(isTaskDelayed).length;
    const totalSeconds = projectTasks.reduce((sum, task) => sum + getLiveSeconds(task), 0);
    const averageSeconds = totalTasks > 0 ? Math.round(totalSeconds / totalTasks) : 0;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    let risk: RiskKey = "green";
    if (delayedTasks > 0 || progress < 40) risk = "red";
    else if (progress < 70) risk = "yellow";
    if (totalTasks === 0) risk = "yellow";

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      delayedTasks,
      totalSeconds,
      averageSeconds,
      progress,
      risk,
    };
  }

  function getProjectDates(projectId: string) {
    const projectTasks = getProjectTasks(projectId);

    const plannedDates = projectTasks
      .map((t) => t.planned_due_date)
      .filter((d): d is string => !!d);

    const actualDates = projectTasks
      .filter((t) => t.status === "completed")
      .map((t) => t.actual_completed_date)
      .filter((d): d is string => !!d);

    const plannedEnd = plannedDates.length > 0
      ? plannedDates.reduce((max, d) => (d > max ? d : max))
      : null;

    const actualEnd = actualDates.length > 0
      ? actualDates.reduce((max, d) => (d > max ? d : max))
      : null;

    return { plannedEnd, actualEnd };
  }

  // ─── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Sessão inválida", "Entre novamente para criar projetos.");
      return;
    }
    setCreating(true);

    const managerId = newManagerId || profile.id;

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        name: newProjectName,
        planned_end_date: newPlannedEndDate || null,
        actual_end_date: newActualEndDate || null,
        manager_id: managerId,
        coordinator_id: newCoordinatorId || null,
        leader_id: newLeaderId || null,
        created_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !project) {
      showErrorToast("Não foi possível criar o projeto", getSupabaseErrorMessage(error));
      setCreating(false);
      return;
    }

    const membersToInsert = [
      { project_id: project.id, user_id: managerId, role: "manager" },
      ...(newCoordinatorId
        ? [{ project_id: project.id, user_id: newCoordinatorId, role: "coordinator" }]
        : []),
      ...(newLeaderId
        ? [{ project_id: project.id, user_id: newLeaderId, role: "leader" }]
        : []),
    ];

    const { error: membersError } = await supabase
      .from("project_members")
      .upsert(membersToInsert, { onConflict: "project_id,user_id" });
    if (membersError) {
      showErrorToast("Projeto criado com pendência", getSupabaseErrorMessage(membersError));
    }

    setNewProjectName("");
    setNewPlannedEndDate("");
    setNewActualEndDate("");
    setNewManagerId("");
    setNewCoordinatorId("");
    setNewLeaderId("");
    setShowNewForm(false);

    await reloadAll({ silent: true });
    showSuccessToast("Projeto criado", "O projeto foi cadastrado com sucesso.");
    setCreating(false);
  }

  function handleStartEdit(project: Project) {
    setEditingProjectId(project.id);
    setEditedProjectName(project.name);
    setEditedPlannedEndDate(project.planned_end_date || "");
    setEditedActualEndDate(project.actual_end_date || "");
    setEditedManagerId(project.manager_id || "");
    setEditedCoordinatorId(project.coordinator_id || "");
    setEditedLeaderId(project.leader_id || "");
  }

  function handleCancelEdit() {
    setEditingProjectId(null);
  }

  async function handleSaveEdit(projectId: string) {
    if (!editedProjectName.trim()) return;
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        name: editedProjectName,
        planned_end_date: editedPlannedEndDate || null,
        actual_end_date: editedActualEndDate || null,
        manager_id: editedManagerId || null,
        coordinator_id: editedCoordinatorId || null,
        leader_id: editedLeaderId || null,
      })
      .eq("id", projectId);
    if (updateError) {
      showErrorToast("Não foi possível salvar o projeto", getSupabaseErrorMessage(updateError));
      return;
    }

    const membersToInsert = [
      ...(editedManagerId
        ? [{ project_id: projectId, user_id: editedManagerId, role: "manager" }]
        : []),
      ...(editedCoordinatorId
        ? [{ project_id: projectId, user_id: editedCoordinatorId, role: "coordinator" }]
        : []),
      ...(editedLeaderId
        ? [{ project_id: projectId, user_id: editedLeaderId, role: "leader" }]
        : []),
    ];
    if (membersToInsert.length > 0) {
      const { error: membersError } = await supabase
        .from("project_members")
        .upsert(membersToInsert, { onConflict: "project_id,user_id" });
      if (membersError) {
        showErrorToast("Projeto salvo com pendência", getSupabaseErrorMessage(membersError));
      }
    }

    handleCancelEdit();
    await reloadAll({ silent: true });
    showSuccessToast("Projeto atualizado", "As alterações foram salvas.");
  }

  async function handleDeleteProject(projectId: string) {
    if (!window.confirm("Excluir este projeto?")) return;

    // Optimistic update — remove já do estado local
    const previousProjects = projects;
    const previousMembers = members;
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setMembers((prev) => prev.filter((m) => m.project_id !== projectId));
    if (expandedProjectId === projectId) setExpandedProjectId(null);

    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) {
      // rollback
      setProjects(previousProjects);
      setMembers(previousMembers);
      showErrorToast("Não foi possível excluir o projeto", getSupabaseErrorMessage(error));
      return;
    }
    await reloadAll({ silent: true });
    showSuccessToast("Projeto excluído", "O projeto foi removido.");
  }

  async function handleAddMember(projectId: string) {
    if (!memberUserId) return;
    const { error } = await supabase
      .from("project_members")
      .upsert(
        { project_id: projectId, user_id: memberUserId, role: memberRole },
        { onConflict: "project_id,user_id" }
      );
    if (error) {
      showErrorToast("Não foi possível vincular pessoa", getSupabaseErrorMessage(error));
      return;
    }
    setMemberProjectId(null);
    setMemberUserId("");
    setMemberRole("member");
    await loadMembers();
    showSuccessToast("Pessoa vinculada", "Integrante adicionado ao projeto.");
  }

  async function handleRemoveMember(projectId: string, userId: string) {
    if (!window.confirm("Remover esta pessoa do projeto?")) return;

    // Optimistic update — some na hora da lista
    const previousMembers = members;
    setMembers((prev) =>
      prev.filter(
        (m) => !(m.project_id === projectId && m.user_id === userId)
      )
    );

    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("user_id", userId);
    if (error) {
      setMembers(previousMembers);
      showErrorToast("Não foi possível remover pessoa", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Pessoa removida", "Integrante removido do projeto.");
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const liveSecondsMap = useMemo(
    () => Object.fromEntries(tasks.map((t) => [t.id, getLiveSeconds(t)])),
    [tasks]
  );

  const disciplines = useMemo(
    () => [...new Set(projects.map((p) => p.discipline).filter(Boolean))] as string[],
    [projects]
  );
  const isSaneamentoTab = useMemo(
    () =>
      activeProjectsTab !== "todos" &&
      activeProjectsTab.toLowerCase().includes("saneamento"),
    [activeProjectsTab]
  );

  const globalStats = useMemo(() => {
    const totalSeconds = tasks.reduce((sum, task) => sum + getLiveSeconds(task), 0);
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.status === "completed").length;
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return {
      totalSeconds,
      totalProjects: projects.length,
      totalTasks,
      completedTasks,
      completionRate,
      delayedTasks: tasks.filter(isTaskDelayed).length,
    };
  }, [tasks, projects]);

  const riskCounts = useMemo(() => {
    const counts = { all: projects.length, green: 0, yellow: 0, red: 0 };
    for (const p of projects) {
      const risk = getProjectStats(p).risk;
      counts[risk] += 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tasks]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (search.trim()) {
        const matches = project.name.toLowerCase().includes(search.trim().toLowerCase());
        if (!matches) return false;
      }
      if (riskFilter !== "all") {
        const risk = getProjectStats(project).risk;
        if (risk !== riskFilter) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, tasks, search, riskFilter]);

  // ─── PDF ──────────────────────────────────────────────────────────────────

  function handleGenerateProjectPdf(project: Project) {
    const projectTasks = getProjectTasks(project.id);
    const projectMembers = getProjectMembers(project.id);

    const contributorsMap = new Map<
      string,
      {
        name: string;
        role: string;
        tasks: number;
        completed: number;
        delayed: number;
        seconds: number;
      }
    >();

    for (const member of projectMembers) {
      const fallbackName = users.find((u) => u.id === member.user_id)?.name || "Colaborador";
      contributorsMap.set(member.user_id, {
        name: member.users?.name || fallbackName,
        role: getRoleLabel(member.role),
        tasks: 0,
        completed: 0,
        delayed: 0,
        seconds: 0,
      });
    }

    for (const task of projectTasks) {
      if (!task.assigned_to) continue;
      const existing = contributorsMap.get(task.assigned_to);
      const fallbackUser = users.find((u) => u.id === task.assigned_to);
      const roleLabel = getRoleLabel(fallbackUser?.role || "employee");

      const base = existing || {
        name: fallbackUser?.name || "Colaborador",
        role: roleLabel,
        tasks: 0,
        completed: 0,
        delayed: 0,
        seconds: 0,
      };

      base.tasks += 1;
      base.completed += task.status === "completed" ? 1 : 0;
      base.delayed += isTaskDelayed(task) ? 1 : 0;
      base.seconds += getLiveSeconds(task);
      contributorsMap.set(task.assigned_to, base);
    }

    const totalTasks = projectTasks.length;
    const completedTasks = projectTasks.filter((t) => t.status === "completed").length;
    const inProgressTasks = projectTasks.filter((t) => t.status === "in_progress").length;
    const pendingTasks = projectTasks.filter((t) => t.status === "pending").length;
    const delayedTasks = projectTasks.filter(isTaskDelayed).length;
    const totalSeconds = projectTasks.reduce((sum, task) => sum + getLiveSeconds(task), 0);
    const averageSeconds = totalTasks > 0 ? Math.round(totalSeconds / totalTasks) : 0;

    generateProjectDashboardPdf({
      projectName: project.name,
      leaderName: getUserName(project.leader_id),
      managerName: getUserName(project.manager_id),
      coordinatorName: getUserName(project.coordinator_id),
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      delayedTasks,
      totalSeconds,
      averageSeconds,
      contributors: Array.from(contributorsMap.values()),
      generatedAt: new Date(),
    });
  }

  // ─── Renderizadores de Card ────────────────────────────────────────────────

  function renderProjectCard(project: Project, isList: boolean) {
    const stats = getProjectStats(project);
    const dates = getProjectDates(project.id);
    const isExpanded = expandedProjectId === project.id;
    const projectMembers = getProjectMembers(project.id);
    const projectTasks = getProjectTasks(project.id);
    const isEditing = editingProjectId === project.id;
    const risk = RISK_CONFIG[stats.risk];
    const teamUsers = projectMembers
      .map((m) => m.users)
      .filter((u): u is User => !!u);

    if (isEditing) {
      return (
        <Card key={project.id}>
          <div className="flex flex-col gap-3">
            <Field label="Nome">
              <Input
                value={editedProjectName}
                onChange={(e) => setEditedProjectName(e.target.value)}
              />
            </Field>
            <div className="grid-2">
              <Field label="Data prevista">
                <Input
                  type="date"
                  value={editedPlannedEndDate}
                  onChange={(e) => setEditedPlannedEndDate(e.target.value)}
                />
              </Field>
              <Field label="Data real">
                <Input
                  type="date"
                  value={editedActualEndDate}
                  onChange={(e) => setEditedActualEndDate(e.target.value)}
                />
              </Field>
            </div>
            <div className="grid-3">
              <Field label="Gerente">
                <Select
                  value={editedManagerId}
                  onChange={(e) => setEditedManagerId(e.target.value)}
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Coordenador">
                <Select
                  value={editedCoordinatorId}
                  onChange={(e) => setEditedCoordinatorId(e.target.value)}
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Líder">
                <Select
                  value={editedLeaderId}
                  onChange={(e) => setEditedLeaderId(e.target.value)}
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleSaveEdit(project.id)}>Salvar</Button>
              <Button variant="ghost" onClick={handleCancelEdit}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    return (
      <div
        key={project.id}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
          transition: "transform 160ms ease, box-shadow 160ms ease",
          boxShadow: isExpanded
            ? "0 12px 28px rgba(2, 6, 23, 0.08)"
            : "var(--shadow-sm)",
        }}
      >
        {/* Risk stripe */}
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, ${risk.color} 0%, ${risk.color}88 100%)`,
          }}
        />

        <div
          style={{ padding: 18, cursor: "pointer" }}
          onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: risk.soft,
                  color: risk.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <FolderKanban size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      margin: 0,
                      letterSpacing: "-0.01em",
                      color: "var(--foreground)",
                    }}
                  >
                    {project.name}
                  </h3>
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: risk.soft,
                      color: risk.fg,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: risk.color,
                      }}
                    />
                    {risk.label}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 6,
                  }}
                >
                  <ProjectDateChip
                    icon={<CalendarDays size={11} />}
                    label="Previsão"
                    value={
                      dates.plannedEnd
                        ? formatBRDate(dates.plannedEnd)
                        : "Sem previsão"
                    }
                    tone="muted"
                  />
                  {dates.actualEnd && (
                    <ProjectDateChip
                      icon={<CheckCircle2 size={11} />}
                      label="Concluído"
                      value={formatBRDate(dates.actualEnd)}
                      tone="success"
                    />
                  )}
                  <ProjectDateChip
                    icon={<Sparkles size={11} />}
                    label="Criado"
                    value={formatBRDate(project.created_at?.slice(0, 10))}
                    tone="muted"
                  />
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {podeEditarProjeto && (
              <>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<FileDown size={14} />}
                onClick={() => handleGenerateProjectPdf(project)}
              >
                PDF
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => handleStartEdit(project)}
                title="Editar"
              >
                <Pencil size={14} />
              </Button>
              <Button
                size="icon-sm"
                variant="danger-ghost"
                onClick={() => handleDeleteProject(project.id)}
                title="Excluir"
              >
                <Trash2 size={14} />
              </Button>
              </>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setExpandedProjectId(isExpanded ? null : project.id)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
            </div>
          </div>

          {/* Stats pills */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isList
                ? "repeat(auto-fit, minmax(120px, 1fr))"
                : "repeat(2, 1fr)",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
                Tarefas
              </div>
              <div
                className="flex items-baseline gap-1 mt-0.5"
                style={{ fontWeight: 700, fontSize: 16 }}
              >
                {stats.completedTasks}
                <span
                  className="text-xs text-muted"
                  style={{ fontWeight: 500 }}
                >
                  / {stats.totalTasks}
                </span>
              </div>
            </div>

            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
                Tempo
              </div>
              <div
                className="mt-0.5"
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: "var(--primary)",
                }}
              >
                {formatSeconds(stats.totalSeconds)}
              </div>
            </div>

            {!isList && (
              <>
                <div
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  <div className="text-xs text-muted" style={{ fontWeight: 500 }}>
                    Em andamento
                  </div>
                  <div
                    className="mt-0.5"
                    style={{ fontWeight: 700, fontSize: 16 }}
                  >
                    {stats.inProgressTasks}
                  </div>
                </div>

                <div
                  style={{
                    background:
                      stats.delayedTasks > 0
                        ? "var(--danger-soft)"
                        : "var(--surface-2)",
                    border:
                      stats.delayedTasks > 0
                        ? `1px solid color-mix(in srgb, var(--danger) 30%, transparent)`
                        : "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  <div
                    className="text-xs"
                    style={{
                      fontWeight: 500,
                      color:
                        stats.delayedTasks > 0
                          ? "var(--danger-fg)"
                          : "var(--muted-fg)",
                    }}
                  >
                    Em atraso
                  </div>
                  <div
                    className="mt-0.5"
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      color:
                        stats.delayedTasks > 0
                          ? "var(--danger)"
                          : "var(--foreground)",
                    }}
                  >
                    {stats.delayedTasks}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Progress */}
          <Progress
            value={stats.progress}
            showLabel
            label="Avanço do projeto"
            variant={
              stats.risk === "red"
                ? "danger"
                : stats.risk === "yellow"
                ? "warning"
                : "success"
            }
          />

          {/* Footer: team + leader */}
          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              {teamUsers.length > 0 ? (
                <>
                  <AvatarStack users={teamUsers} max={4} />
                  <span className="text-xs text-muted">
                    {teamUsers.length}{" "}
                    {teamUsers.length === 1 ? "pessoa" : "pessoas"}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted">Sem equipe vinculada</span>
              )}
            </div>
            {project.leader_id && (
              <span className="text-xs text-muted inline-flex items-center gap-1">
                <Crown size={11} style={{ color: "var(--warning)" }} />
                <strong style={{ color: "var(--foreground)", fontWeight: 600 }}>
                  {getUserName(project.leader_id)}
                </strong>
                <span>liderando</span>
              </span>
            )}
          </div>
        </div>

        {/* Expanded panel */}
        {isExpanded && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--surface-2)",
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h4
                className="flex items-center gap-2"
                style={{ fontSize: 14, fontWeight: 700, margin: 0 }}
              >
                <UsersIcon size={15} className="text-muted" />
                Equipe vinculada
                <span className="text-xs text-muted" style={{ fontWeight: 500 }}>
                  ({projectMembers.length})
                </span>
              </h4>
              {podeEditarProjeto && (
              <Button
                size="sm"
                leftIcon={<UserPlus size={14} />}
                onClick={() => {
                  setMemberProjectId(project.id);
                  setMemberUserId("");
                  setMemberRole("member");
                }}
              >
                Vincular pessoa
              </Button>
              )}
            </div>

            {memberProjectId === project.id && (
              <div
                className="flex gap-2 mb-3 flex-wrap"
                style={{
                  padding: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}
              >
                <Select
                  value={memberUserId}
                  onChange={(e) => setMemberUserId(e.target.value)}
                  style={{ minWidth: 200, flex: 1 }}
                >
                  <option value="">Selecione a pessoa</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  style={{ minWidth: 160 }}
                >
                  <option value="member">Membro</option>
                  <option value="manager">Gerente</option>
                  <option value="coordinator">Coordenador</option>
                  <option value="leader">Líder</option>
                </Select>
                <Button onClick={() => handleAddMember(project.id)}>
                  Adicionar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMemberProjectId(null)}
                >
                  <X size={14} />
                </Button>
              </div>
            )}

            {projectMembers.length === 0 ? (
              <EmptyState
                title="Nenhuma pessoa vinculada"
                description="Adicione membros pra acompanhar carga e produção por colaborador."
              />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 10,
                }}
              >
                {projectMembers.map((member) => {
                  const user = member.users;
                  const userTasks = user
                    ? getUserTasksInProject(project.id, user.id)
                    : [];
                  const totalSeconds = userTasks.reduce(
                    (s, t) => s + getLiveSeconds(t),
                    0
                  );
                  const completed = userTasks.filter(
                    (t) => t.status === "completed"
                  ).length;
                  const delayed = userTasks.filter(isTaskDelayed).length;
                  const isManager = member.role === "manager";

                  return (
                    <div
                      key={`${member.project_id}-${member.user_id}`}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 14,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar name={user?.name || "?"} size="lg" primary />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <strong
                              style={{
                                fontSize: 14,
                                color: "var(--foreground)",
                              }}
                            >
                              {user?.name}
                            </strong>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: isManager
                                  ? "var(--warning-soft)"
                                  : "var(--primary-soft)",
                                color: isManager
                                  ? "var(--warning-fg)"
                                  : "var(--primary)",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.02em",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              {isManager && <Crown size={10} />}
                              {getRoleLabel(member.role)}
                            </span>
                          </div>
                          <div className="text-xs text-muted truncate">
                            {user?.email || "Sem e-mail"}
                          </div>
                        </div>
                        {podeEditarProjeto && (
                        <Button
                          size="icon-sm"
                          variant="danger-ghost"
                          onClick={() =>
                            handleRemoveMember(project.id, member.user_id)
                          }
                          title="Remover do projeto"
                        >
                          <Trash2 size={14} />
                        </Button>
                        )}
                      </div>

                      <div
                        className="grid mt-3 gap-1.5"
                        style={{
                          gridTemplateColumns: "repeat(4, 1fr)",
                        }}
                      >
                        <div
                          style={{
                            background: "var(--surface-2)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            className="text-xs text-muted"
                            style={{ fontWeight: 500 }}
                          >
                            Tempo
                          </div>
                          <strong
                            className="text-xs block"
                            style={{ color: "var(--primary)" }}
                          >
                            {formatSeconds(totalSeconds)}
                          </strong>
                        </div>
                        <div
                          style={{
                            background: "var(--surface-2)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            className="text-xs text-muted"
                            style={{ fontWeight: 500 }}
                          >
                            Tarefas
                          </div>
                          <strong className="text-xs block">
                            {userTasks.length}
                          </strong>
                        </div>
                        <div
                          style={{
                            background: "var(--success-soft)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            className="text-xs"
                            style={{
                              color: "var(--success-fg)",
                              fontWeight: 500,
                            }}
                          >
                            Feitas
                          </div>
                          <strong
                            className="text-xs block"
                            style={{ color: "var(--success-fg)" }}
                          >
                            {completed}
                          </strong>
                        </div>
                        <div
                          style={{
                            background:
                              delayed > 0
                                ? "var(--danger-soft)"
                                : "var(--surface-2)",
                            borderRadius: 8,
                            padding: "6px 8px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            className="text-xs"
                            style={{
                              color:
                                delayed > 0
                                  ? "var(--danger-fg)"
                                  : "var(--muted-fg)",
                              fontWeight: 500,
                            }}
                          >
                            Atrasadas
                          </div>
                          <strong
                            className="text-xs block"
                            style={{
                              color:
                                delayed > 0
                                  ? "var(--danger-fg)"
                                  : "var(--foreground)",
                            }}
                          >
                            {delayed}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {projectTasks.filter((t) => !t.assigned_to).length > 0 && (
              <div className="mt-4">
                <h4
                  className="mb-2 flex items-center gap-2"
                  style={{ fontSize: 13, fontWeight: 700 }}
                >
                  <AlertTriangle size={13} style={{ color: "var(--warning)" }} />
                  Tarefas sem responsável (
                  {projectTasks.filter((t) => !t.assigned_to).length})
                </h4>
                <div className="flex flex-col gap-1.5">
                  {projectTasks
                    .filter((t) => !t.assigned_to)
                    .map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-md"
                        style={{
                          background: "var(--warning-soft)",
                          border:
                            "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
                        }}
                      >
                        <span className="text-sm font-medium">{t.title}</span>
                        <span className="text-xs text-muted">
                          {formatSeconds(getLiveSeconds(t))}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!podeCriarProjeto) setShowNewForm(false);
  }, [podeCriarProjeto]);

  return (
    <div>
      <PageHeader
        title="Projetos"
        description={
          isSaneamentoTab
            ? activeSaneamentoView === "dashboard"
              ? "Painel de saneamento com gráficos, desempenho e acompanhamento por projeto."
              : "Visão operacional dos projetos de saneamento, igual ao fluxo atual da área."
            : projetistaSomenteTarefas
            ? "Projetos onde você participa. Você pode criar e acompanhar tarefas; edição do projeto é feita por coordenação ou projetista líder."
            : "Visão completa por projeto, com equipe, carga e indicadores de risco."
        }
        actions={
          activeProjectsTab !== "todos" &&
          (!isSaneamentoTab || activeSaneamentoView === "dashboard") ? (
            <PeriodFilter value={period} onChange={setPeriod} />
          ) : podeCriarProjeto ? (
            <Button
              leftIcon={<Plus size={16} />}
              onClick={() => setShowNewForm((v) => !v)}
            >
              {showNewForm ? "Fechar" : "Novo projeto"}
            </Button>
          ) : undefined
        }
      />

      {/* ─── Discipline tabs ──────────────────────────────────── */}
      {!loading && projects.length > 0 && (
        <div className="mb-6">
          <div className="tabs" style={{ maxWidth: "100%", overflowX: "auto" }}>
            <button
              className="tab"
              data-active={activeProjectsTab === "todos" ? "true" : "false"}
              onClick={() => setActiveProjectsTab("todos")}
            >
              <FolderKanban size={14} />
              Todos os projetos
            </button>
            {disciplines.map((disc) => (
              <button
                key={disc}
                className="tab"
                data-active={activeProjectsTab === disc ? "true" : "false"}
                onClick={() => {
                  setActiveProjectsTab(disc);
                  if (disc.toLowerCase().includes("saneamento")) {
                    setActiveSaneamentoView("dashboard");
                  }
                }}
              >
                {disc.toLowerCase().includes("saneamento") ? (
                  <Droplets size={14} />
                ) : (
                  getDisciplineIcon(disc)
                )}
                {disc.toLowerCase().includes("saneamento")
                  ? "Saneamento"
                  : getDisciplineLabel(disc)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Discipline tab content ────────────────────────────── */}
      {activeProjectsTab !== "todos" && !isSaneamentoTab && (
        <DashboardDisciplina
          discipline={activeProjectsTab}
          projects={projects.filter((p) => p.discipline === activeProjectsTab) as DashProject[]}
          tasks={tasks as DashTask[]}
          users={users}
          approvals={approvals}
          phases={phases}
          liveSecondsMap={liveSecondsMap}
          period={period}
        />
      )}

      {activeProjectsTab !== "todos" && isSaneamentoTab && (
        <div className="flex flex-col gap-5">
          <div className="tabs" style={{ alignSelf: "flex-start" }}>
            <button
              className="tab"
              data-active={activeSaneamentoView === "dashboard" ? "true" : "false"}
              onClick={() => setActiveSaneamentoView("dashboard")}
            >
              <BarChart3 size={14} />
              Dashboard
            </button>
            <button
              className="tab"
              data-active={activeSaneamentoView === "portfolio" ? "true" : "false"}
              onClick={() => setActiveSaneamentoView("portfolio")}
            >
              <Droplets size={14} />
              Visão do projeto
            </button>
          </div>

          {activeSaneamentoView === "dashboard" ? (
            <DashboardDisciplina
              discipline={activeProjectsTab}
              projects={projects.filter((p) => p.discipline === activeProjectsTab) as DashProject[]}
              tasks={tasks as DashTask[]}
              users={users}
              approvals={approvals}
              phases={phases}
              liveSecondsMap={liveSecondsMap}
              period={period}
            />
          ) : (
            <SaneamentoListPage />
          )}
        </div>
      )}

      {/* ─── Top stats ─────────────────────────────────────────── */}
      {activeProjectsTab === "todos" && <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <StatTile
          label="Projetos ativos"
          value={globalStats.totalProjects}
          icon={<FolderKanban size={18} />}
          variant="primary"
          hint={
            riskCounts.green > 0
              ? `${riskCounts.green} saudáveis · ${riskCounts.red} em risco`
              : undefined
          }
        />
        <StatTile
          label="Tempo total produzido"
          value={formatSeconds(globalStats.totalSeconds)}
          icon={<Clock size={18} />}
          variant="purple"
        />
        <StatTile
          label="Tarefas concluídas"
          value={globalStats.completedTasks}
          icon={<CheckCircle2 size={18} />}
          variant="success"
          hint={`${globalStats.completionRate}% das ${globalStats.totalTasks} tarefas`}
        />
        <StatTile
          label="Tarefas em atraso"
          value={globalStats.delayedTasks}
          icon={<AlertTriangle size={18} />}
          variant={globalStats.delayedTasks > 0 ? "danger" : "success"}
          hint={
            globalStats.delayedTasks > 0
              ? `${Math.round(
                  (globalStats.delayedTasks /
                    Math.max(globalStats.totalTasks, 1)) *
                    100
                )}% do total`
              : "Tudo em dia"
          }
        />
      </div>}

      {/* ─── Form de novo projeto ───────────────────────────── */}
      {activeProjectsTab === "todos" && podeCriarProjeto && showNewForm && (
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
              <div className="card-title">Novo projeto</div>
              <p className="text-xs text-muted mt-0.5">
                Defina nome, prazos e a tríade de responsáveis
              </p>
            </div>
          </div>
          <div className="card-padded">
            <div className="flex flex-col gap-3">
              <Field label="Nome do projeto">
                <Input
                  placeholder="Ex.: Edifício Aurora — fase 1"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
              </Field>
              <div className="grid-2">
                <Field label="Data prevista de entrega">
                  <Input
                    type="date"
                    value={newPlannedEndDate}
                    onChange={(e) => setNewPlannedEndDate(e.target.value)}
                  />
                </Field>
                <Field label="Data real de entrega">
                  <Input
                    type="date"
                    value={newActualEndDate}
                    onChange={(e) => setNewActualEndDate(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid-3">
                <Field label="Gerente">
                  <Select
                    value={newManagerId}
                    onChange={(e) => setNewManagerId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Coordenador">
                  <Select
                    value={newCoordinatorId}
                    onChange={(e) => setNewCoordinatorId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Líder">
                  <Select
                    value={newLeaderId}
                    onChange={(e) => setNewLeaderId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreateProject} loading={creating}>
                  Criar projeto
                </Button>
                <Button variant="ghost" onClick={() => setShowNewForm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Toolbar ──────────────────────────────────────────── */}
      {activeProjectsTab === "todos" && <div
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
            placeholder="Buscar projeto pelo nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            active={riskFilter === "all"}
            label="Todos"
            count={riskCounts.all}
            onClick={() => setRiskFilter("all")}
          />
          <FilterChip
            active={riskFilter === "green"}
            label="Saudáveis"
            count={riskCounts.green}
            onClick={() => setRiskFilter("green")}
            color={RISK_CONFIG.green.color}
          />
          <FilterChip
            active={riskFilter === "yellow"}
            label="Atenção"
            count={riskCounts.yellow}
            onClick={() => setRiskFilter("yellow")}
            color={RISK_CONFIG.yellow.color}
          />
          <FilterChip
            active={riskFilter === "red"}
            label="Risco"
            count={riskCounts.red}
            onClick={() => setRiskFilter("red")}
            color={RISK_CONFIG.red.color}
          />
        </div>

        <div
          className="flex items-center gap-1 p-1 rounded-md"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
          }}
          title="Alternar visualização"
        >
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: viewMode === "grid" ? "var(--surface)" : "transparent",
              color:
                viewMode === "grid" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow:
                viewMode === "grid" ? "var(--shadow-sm)" : "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <LayoutGrid size={13} />
            Grade
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
              color:
                viewMode === "list" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow:
                viewMode === "list" ? "var(--shadow-sm)" : "none",
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
      </div>}

      {/* ─── Grid/List de projetos ─────────────────────────── */}
      {activeProjectsTab === "todos" && <div>
        {loading && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 14,
            }}
          >
            <SkeletonCard height={220} />
            <SkeletonCard height={220} />
            <SkeletonCard height={220} />
          </div>
        )}

        {!loading && projects.length === 0 && (
          <EmptyState
            icon={<FolderKanban size={22} />}
            title="Nenhum projeto cadastrado"
            description={
              podeCriarProjeto
                ? "Crie seu primeiro projeto pra começar a medir produtividade da equipe."
                : "Quando você for adicionado a um projeto, ele aparecerá aqui. Você pode criar tarefas dentro dos projetos da sua equipe."
            }
            action={
              podeCriarProjeto ? (
                <Button leftIcon={<Plus size={16} />} onClick={() => setShowNewForm(true)}>
                  Novo projeto
                </Button>
              ) : undefined
            }
          />
        )}

        {!loading && projects.length > 0 && filteredProjects.length === 0 && (
          <EmptyState
            icon={<Search size={22} />}
            title="Nenhum projeto encontrado"
            description="Tente outro termo de busca ou limpe os filtros."
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setRiskFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        )}

        {!loading && filteredProjects.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                viewMode === "grid"
                  ? "repeat(auto-fill, minmax(380px, 1fr))"
                  : "1fr",
              gap: 14,
            }}
          >
            {filteredProjects.map((project) =>
              renderProjectCard(project, viewMode === "list")
            )}
          </div>
        )}
      </div>}

      {/* ─── Footer summary (só quando filtra) ───────────────── */}
      {activeProjectsTab === "todos" && !loading && filteredProjects.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 flex-wrap mt-4 text-xs text-muted"
          style={{ paddingInline: 4 }}
        >
          <span className="inline-flex items-center gap-1">
            <Activity size={12} />
            Mostrando <strong>{filteredProjects.length}</strong> de{" "}
            <strong>{projects.length}</strong> projetos
          </span>
          {globalStats.completionRate > 0 && (
            <span className="inline-flex items-center gap-1">
              <TrendingUp size={12} />
              Taxa global de conclusão:{" "}
              <strong>{globalStats.completionRate}%</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
