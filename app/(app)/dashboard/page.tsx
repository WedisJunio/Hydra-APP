"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FolderKanban } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  filterTasksForDashboard,
  filterUsersForDashboard,
  hasFullPortfolioAccess,
  isNarrowProjetista,
} from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

import {
  DashboardGeral,
  DashboardSkeleton,
  PeriodFilter,
  getLiveSeconds,
} from "@/components/dashboard/engine";
import type {
  Project,
  User,
  Task,
  Approval,
  Phase,
  PeriodKey,
} from "@/components/dashboard/engine";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [, setClock] = useState(0);

  const hasRunningTimer = useMemo(
    () => tasks.some((t) => t.is_timer_running),
    [tasks]
  );

  useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setClock((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError(null);

      const profile = await getCurrentProfile();
      if (!profile) {
        setError("Não foi possível carregar seu perfil. Faça login novamente.");
        setLoading(false);
        return;
      }
      setMyRole(profile.role);

      const [projectsResponse, tasksResponse, usersResponse, approvalsResponse, phasesResponse] =
        await Promise.all([
          supabase
            .from("projects")
            .select("id, name, discipline")
            .order("name", { ascending: true }),
          supabase
            .from("tasks")
            .select(
              "id, title, status, project_id, assigned_to, created_by, planned_due_date, actual_completed_date, completed_at, created_at, time_spent_seconds, is_timer_running, started_at"
            ),
          supabase
            .from("users")
            .select("id, name, role")
            .eq("is_active", true)
            .order("name", { ascending: true }),
          supabase
            .from("external_approvals")
            .select("id, project_id, status, expected_response_date"),
          supabase.from("project_phases").select("id, project_id, status"),
        ]);

      if (
        projectsResponse.error ||
        tasksResponse.error ||
        usersResponse.error
      ) {
        const msg =
          projectsResponse.error?.message ||
          tasksResponse.error?.message ||
          usersResponse.error?.message ||
          "Erro desconhecido";
        setError(`Erro ao carregar dados: ${msg}`);
        setLoading(false);
        return;
      }

      const rawTasks = (tasksResponse.data as Task[]) || [];
      const rawUsers =
        (usersResponse.data as { id: string; name: string; role: string | null }[]) || [];

      const viewTasks = filterTasksForDashboard(rawTasks, profile.id, profile.role) as Task[];
      const viewUsersRows = filterUsersForDashboard(rawUsers, profile.id, profile.role);
      const viewUsers: User[] = viewUsersRows.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
      }));

      const projectIds = new Set((projectsResponse.data as Project[] | null)?.map((p) => p.id) ?? []);
      const rawApprovals = (approvalsResponse.data as Approval[]) || [];
      const rawPhases = (phasesResponse.data as Phase[]) || [];

      setProjects((projectsResponse.data as Project[]) || []);
      setTasks(viewTasks);
      setUsers(viewUsers);
      setApprovals(rawApprovals.filter((a) => projectIds.has(a.project_id)));
      setPhases(rawPhases.filter((ph) => projectIds.has(ph.project_id)));
      setLoading(false);
    }

    loadDashboard();
  }, []);

  const liveSecondsMap = useMemo(
    () => Object.fromEntries(tasks.map((t) => [t.id, getLiveSeconds(t)])),
    [tasks]
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={
          !loading && myRole && !hasFullPortfolioAccess(myRole)
            ? isNarrowProjetista(myRole)
              ? "Visão restrita: apenas projetos e tarefas vinculados a você."
              : "Rendimento da sua equipe (projetistas e projetistas líderes); cargos acima do seu não entram nos gráficos por pessoa."
            : "Produtividade, tempo, tarefas e desempenho da equipe em um só lugar."
        }
        actions={
          !loading && projects.length > 0 ? (
            <PeriodFilter value={period} onChange={setPeriod} />
          ) : undefined
        }
      />

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <Card>
          <div className="flex items-center gap-3" style={{ color: "var(--danger)" }}>
            <AlertTriangle size={20} />
            <span>{error}</span>
          </div>
        </Card>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={22} />}
          title="Comece criando seu primeiro projeto"
          description="Pra ver dados aqui, crie projetos e tarefas e os números vão aparecer em tempo real."
        />
      ) : (
        <DashboardGeral
          projects={projects}
          tasks={tasks}
          users={users}
          approvals={approvals}
          phases={phases}
          liveSecondsMap={liveSecondsMap}
          period={period}
        />
      )}
    </div>
  );
}
