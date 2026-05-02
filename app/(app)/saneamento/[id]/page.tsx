"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Droplets,
  Building2,
  MapPin,
  Users as UsersIcon,
  Calendar as CalendarIcon,
  Activity,
  CheckSquare,
  AlertCircle,
  Settings,
  Eye,
  BookOpen,
  TrendingUp,
  Layers,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import {
  getSanitationProject,
  getClient,
  listProjectPhases,
  listActiveUsers,
  countProjectTasks,
  updatePhaseStatus as updatePhaseStatusData,
} from "@/lib/saneamento/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { PhaseTimeline } from "@/components/saneamento/phase-timeline";
import { PhasesEditor } from "@/components/saneamento/phases-editor";
import { PhaseStructureBoard } from "@/components/saneamento/phase-structure-board";
import { TasksTab } from "@/components/saneamento/tasks-tab";
import { JournalTab } from "@/components/saneamento/journal-tab";
import type {
  Client,
  PhaseStatus,
  ProjectPhase,
  SanitationProject,
} from "@/lib/saneamento/types";
import {
  sanitationTypeLabel,
  sanitationTypeShort,
} from "@/lib/saneamento/types";
import {
  phaseStatusLabel,
  phaseStatusVariant,
} from "@/lib/saneamento/phases";
import { formatDate } from "@/lib/utils";

type TabKey = "overview" | "tasks" | "journal";

type SimpleUser = { id: string; name: string };

type RiskKey = "ok" | "warn" | "risk";

const RISK_CONFIG: Record<
  RiskKey,
  { label: string; color: string; soft: string; text: string }
> = {
  ok: {
    label: "Saudável",
    color: "var(--success)",
    soft: "var(--success-soft)",
    text: "Projeto avançando bem",
  },
  warn: {
    label: "Atenção",
    color: "var(--warning)",
    soft: "var(--warning-soft)",
    text: "Acompanhe com atenção",
  },
  risk: {
    label: "Urgente",
    color: "var(--danger)",
    soft: "var(--danger-soft)",
    text: "Requer ação imediata",
  },
};

function computeRisk(progress: number): RiskKey {
  if (progress >= 80) return "ok";
  if (progress >= 40) return "warn";
  return "risk";
}

function StatTile({
  label,
  value,
  hint,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  color?: string;
}) {
  const accent = color || "var(--primary)";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--muted)",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {icon && (
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon}
          </span>
        )}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export default function SaneamentoProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState<SanitationProject | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");

  async function loadAll(opts?: { silent?: boolean }) {
    if (!projectId) return;
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);

    const [proj, phaseList, userList, taskTotal] = await Promise.all([
      getSanitationProject(projectId),
      listProjectPhases(projectId),
      listActiveUsers(),
      countProjectTasks(projectId),
    ]);

    const clientData = proj?.client_id ? await getClient(proj.client_id) : null;

    setProject(proj);
    setClient(clientData);
    setPhases(phaseList);
    setUsers(userList);
    setTaskCount(taskTotal);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [projectId]);

  const progress = useMemo(() => {
    const considered = phases.filter((p) => p.status !== "skipped");
    if (considered.length === 0) return 0;
    const approved = considered.filter((p) => p.status === "approved").length;
    return Math.round((approved / considered.length) * 100);
  }, [phases]);

  const currentPhase = useMemo(() => {
    const sorted = [...phases].sort((a, b) => a.order - b.order);
    return (
      sorted.find((p) => p.status === "in_progress") ||
      sorted.find((p) => p.status === "in_review") ||
      sorted.find((p) => p.status === "on_hold") ||
      sorted.find((p) => p.status === "pending") ||
      null
    );
  }, [phases]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: 320 }} />
        <SkeletonCard height={140} />
        <SkeletonCard height={200} />
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={<AlertCircle size={22} />}
        title="Projeto não encontrado"
        description="Este projeto pode ter sido excluído ou você não tem acesso."
        action={
          <Button variant="secondary" onClick={() => router.push("/saneamento")}>
            Voltar para a lista
          </Button>
        }
      />
    );
  }

  async function updatePhaseStatus(phase: ProjectPhase, status: PhaseStatus) {
    setPhases((prev) =>
      prev.map((p) => (p.id === phase.id ? { ...p, status } : p))
    );
    try {
      await updatePhaseStatusData(phase, status);
      await loadAll({ silent: true });
    } catch {
      await loadAll({ silent: true });
    }
  }

  const riskKey = computeRisk(progress);
  const riskCfg = RISK_CONFIG[riskKey];
  const totalPhases = phases.filter((p) => p.status !== "skipped").length;
  const approvedPhases = phases.filter((p) => p.status === "approved").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Voltar */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft size={14} />}
          onClick={() => router.push("/saneamento")}
        >
          Voltar para projetos
        </Button>
      </div>

      {/* HERO do projeto */}
      <div
        style={{
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* faixa de risco no topo */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: `linear-gradient(90deg, ${riskCfg.color}, color-mix(in srgb, ${riskCfg.color} 35%, transparent))`,
          }}
        />

        {/* fundo sutil */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(800px 200px at 0% 0%, ${riskCfg.soft}, transparent 60%)`,
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative", padding: "22px 22px 18px" }}>
          <div
            className="flex items-start gap-4 flex-wrap"
            style={{ marginBottom: 18 }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: riskCfg.soft,
                color: riskCfg.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Droplets size={26} />
            </div>

            <div className="min-w-0" style={{ flex: 1 }}>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
                {project.sanitation_type && (
                  <Badge variant="primary">
                    {sanitationTypeShort[project.sanitation_type]}
                  </Badge>
                )}
                {project.contract_number && (
                  <Badge variant="neutral">Nº {project.contract_number}</Badge>
                )}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "3px 10px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    background: riskCfg.soft,
                    color: riskCfg.color,
                    border: `1px solid color-mix(in srgb, ${riskCfg.color} 30%, transparent)`,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      background: riskCfg.color,
                    }}
                  />
                  {riskCfg.label}
                </span>
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 26,
                  fontWeight: 800,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.15,
                }}
              >
                {project.name}
              </h1>
              {project.sanitation_type && (
                <p className="text-sm text-muted" style={{ margin: "4px 0 0" }}>
                  {sanitationTypeLabel[project.sanitation_type]}
                </p>
              )}
              <div
                className="flex items-center flex-wrap text-sm text-muted"
                style={{ gap: 16, marginTop: 10 }}
              >
                {client && (
                  <span className="flex items-center gap-1">
                    <Building2 size={13} />
                    {client.short_name || client.name}
                  </span>
                )}
                {project.municipality && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} />
                    {project.municipality}
                    {project.state ? ` / ${project.state}` : ""}
                  </span>
                )}
                {project.planned_end_date && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon size={13} />
                    Prazo {formatDate(project.planned_end_date)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra de progresso com label */}
          <div style={{ marginBottom: 18 }}>
            <div
              className="flex items-center justify-between"
              style={{ marginBottom: 6 }}
            >
              <span
                style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}
              >
                Avanço técnico
                {currentPhase ? ` · ${currentPhase.name}` : ""}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: riskCfg.color,
                  letterSpacing: "-0.01em",
                }}
              >
                {progress}%
              </span>
            </div>
            <Progress
              value={progress}
              variant={progress === 100 ? "success" : "primary"}
            />
          </div>

          {/* StatTiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            <StatTile
              icon={<Layers size={13} />}
              label="Fases aprovadas"
              value={`${approvedPhases}/${totalPhases || 0}`}
              hint={
                currentPhase
                  ? `Atual: ${currentPhase.name}`
                  : "Sem fase em andamento"
              }
              color="var(--primary)"
            />
            <StatTile
              icon={<CheckSquare size={13} />}
              label="Tarefas"
              value={taskCount}
              hint={taskCount > 0 ? "Veja na aba Tarefas" : "Nenhuma cadastrada"}
              color="var(--success)"
            />
            {project.contract_value != null && (
              <StatTile
                icon={<TrendingUp size={13} />}
                label="Valor do contrato"
                value={Number(project.contract_value).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })}
                hint={
                  project.population_final
                    ? `Atende ${Number(project.population_final).toLocaleString("pt-BR")} hab.`
                    : undefined
                }
                color="var(--primary)"
              />
            )}
            {project.population_final != null &&
              project.contract_value == null && (
                <StatTile
                  icon={<UsersIcon size={13} />}
                  label="População atendida"
                  value={Number(project.population_final).toLocaleString(
                    "pt-BR"
                  )}
                  hint="habitantes"
                  color="var(--primary)"
                />
              )}
          </div>
        </div>
      </div>

      {/* ABAS */}
      <div className="tabs" style={{ alignSelf: "flex-start" }}>
        <button
          className="tab"
          data-active={tab === "overview" ? "true" : "false"}
          onClick={() => setTab("overview")}
        >
          <Activity size={14} />
          Visão geral
        </button>
        <button
          className="tab"
          data-active={tab === "tasks" ? "true" : "false"}
          onClick={() => setTab("tasks")}
        >
          <CheckSquare size={14} />
          Tarefas
          {taskCount > 0 && <Badge variant="neutral">{taskCount}</Badge>}
        </button>
        <button
          className="tab"
          data-active={tab === "journal" ? "true" : "false"}
          onClick={() => setTab("journal")}
        >
          <BookOpen size={14} />
          Diário
        </button>
      </div>

      {/* CONTEÚDO DA ABA */}
      {tab === "overview" && (
        <OverviewTab
          project={project}
          phases={phases}
          users={users}
          onUpdatePhase={updatePhaseStatus}
          onPhasesChanged={loadAll}
          notes={project.notes}
        />
      )}

      {tab === "tasks" && (
        <TasksTab projectId={project.id} users={users} phases={phases} />
      )}

      {tab === "journal" && (
        <JournalTab projectId={project.id} users={users} phases={phases} />
      )}
    </div>
  );
}

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────

function OverviewTab({
  project,
  phases,
  users,
  onUpdatePhase,
  onPhasesChanged,
  notes,
}: {
  project: SanitationProject;
  phases: ProjectPhase[];
  users: SimpleUser[];
  onUpdatePhase: (phase: ProjectPhase, status: PhaseStatus) => Promise<void>;
  onPhasesChanged: () => Promise<void>;
  notes: string | null;
}) {
  const [selectedPhase, setSelectedPhase] = useState<ProjectPhase | null>(null);
  const [editingPhases, setEditingPhases] = useState(false);
  const [taskCountsByPhase, setTaskCountsByPhase] = useState<Map<string, number>>(
    new Map()
  );

  // Carrega contagem de tarefas por fase (pra mostrar no editor antes de excluir)
  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase
        .from("tasks")
        .select("phase_id")
        .eq("project_id", project.id)
        .not("phase_id", "is", null);
      if (!active) return;
      const counts = new Map<string, number>();
      const rows = (data as unknown as { phase_id: string | null }[]) || [];
      for (const r of rows) {
        if (r.phase_id) counts.set(r.phase_id, (counts.get(r.phase_id) || 0) + 1);
      }
      setTaskCountsByPhase(counts);
    }
    load();
    return () => {
      active = false;
    };
  }, [project.id, phases]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <div className="card-title">
              {editingPhases ? "Editar fases do projeto" : "Fases do Projeto"}
            </div>
            <p className="text-sm text-muted mt-1">
              {editingPhases
                ? "Adicione, renomeie, reordene ou exclua fases conforme o projeto exigir."
                : "Clique em uma etapa para alterar o status."}
            </p>
          </div>
          <Button
            size="sm"
            variant={editingPhases ? "primary" : "secondary"}
            leftIcon={
              editingPhases ? <Eye size={14} /> : <Settings size={14} />
            }
            onClick={() => {
              setEditingPhases((v) => !v);
              setSelectedPhase(null);
            }}
          >
            {editingPhases ? "Concluir edição" : "Editar fases"}
          </Button>
        </div>

        {editingPhases ? (
          <PhasesEditor
            projectId={project.id}
            phases={phases}
            taskCountsByPhase={taskCountsByPhase}
            onChanged={onPhasesChanged}
          />
        ) : (
          <PhaseTimeline phases={phases} onPhaseClick={setSelectedPhase} />
        )}

        {!editingPhases && selectedPhase && (
          <div
            className="mt-6"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 16,
            }}
          >
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div>
                <strong className="text-md">{selectedPhase.name}</strong>
                <Badge
                  variant={phaseStatusVariant[selectedPhase.status]}
                  className="ml-2"
                >
                  {phaseStatusLabel[selectedPhase.status]}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedPhase(null)}
              >
                Fechar
              </Button>
            </div>
            {selectedPhase.notes && (
              <p className="text-sm text-muted mb-3">{selectedPhase.notes}</p>
            )}
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  "pending",
                  "in_progress",
                  "in_review",
                  "approved",
                  "on_hold",
                  "skipped",
                ] as PhaseStatus[]
              ).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={selectedPhase.status === s ? "primary" : "secondary"}
                  onClick={async () => {
                    await onUpdatePhase(selectedPhase, s);
                    setSelectedPhase(null);
                  }}
                >
                  {phaseStatusLabel[s]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <PhaseStructureBoard
        projectId={project.id}
        phases={phases}
        users={users}
      />

      {notes && (
        <Card>
          <div className="card-title mb-2">Observações</div>
          <p className="text-sm" style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {notes}
          </p>
        </Card>
      )}
    </div>
  );
}
