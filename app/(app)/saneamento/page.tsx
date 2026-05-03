"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Droplets,
  Search,
  X,
  ChevronRight,
  AlertCircle,
  Building2,
  MapPin,
  Users as UsersIcon,
  Activity,
  LayoutGrid,
  List,
  Filter,
  ClipboardCheck,
  FileText,
  CalendarDays,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { NewProjectModal } from "@/components/saneamento/new-project-modal";
import type {
  Client,
  ExternalApproval,
  ProjectPhase,
  SanitationProject,
  SanitationType,
} from "@/lib/saneamento/types";
import {
  listSanitationProjects,
  listClients,
  listPhasesForProjects,
  listApprovalsForProjects,
} from "@/lib/saneamento/data";
import { sanitationTypeShort } from "@/lib/saneamento/types";
import {
  approvalStatusLabel,
  approvalStatusVariant,
} from "@/lib/saneamento/agencies";

// ─── Types & helpers ────────────────────────────────────────────────────────

type ProjectWithExtras = SanitationProject & {
  phases: ProjectPhase[];
  approvals: ExternalApproval[];
  client?: Client | null;
};

type RiskKey = "green" | "yellow" | "red";
type RiskFilter = "all" | RiskKey;
type ViewMode = "grid" | "list";

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
    label: "Urgente",
    color: "var(--danger)",
    soft: "var(--danger-soft)",
    fg: "var(--danger-fg)",
  },
};

function getCurrentPhase(phases: ProjectPhase[]) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const inProgress = sorted.find((p) => p.status === "in_progress");
  if (inProgress) return inProgress;
  const inReview = sorted.find((p) => p.status === "in_review");
  if (inReview) return inReview;
  const onHold = sorted.find((p) => p.status === "on_hold");
  if (onHold) return onHold;
  const nextPending = sorted.find(
    (p) => p.status === "pending" || p.status === "skipped"
  );
  if (nextPending) return nextPending;
  return sorted[sorted.length - 1] ?? null;
}

function getProjectProgress(phases: ProjectPhase[]) {
  if (phases.length === 0) return 0;
  const considered = phases.filter((p) => p.status !== "skipped");
  if (considered.length === 0) return 0;
  const approved = considered.filter((p) => p.status === "approved").length;
  return Math.round((approved / considered.length) * 100);
}

function getNextOpenApproval(approvals: ExternalApproval[]) {
  const open = approvals.filter(
    (a) =>
      a.status !== "approved" &&
      a.status !== "rejected" &&
      a.status !== "cancelled"
  );
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const da = a.expected_response_date || "9999-12-31";
    const db = b.expected_response_date || "9999-12-31";
    return da.localeCompare(db);
  })[0];
}

function getProjectRisk(approvals: ExternalApproval[]): RiskKey {
  const today = new Date().toISOString().slice(0, 10);
  const open = approvals.filter(
    (a) =>
      a.status !== "approved" &&
      a.status !== "rejected" &&
      a.status !== "cancelled"
  );
  const overdue = open.some(
    (a) => a.expected_response_date && a.expected_response_date < today
  );
  if (overdue) return "red";
  const closingSoon = open.some((a) => {
    if (!a.expected_response_date) return false;
    const days =
      (new Date(a.expected_response_date + "T00:00:00").getTime() -
        Date.now()) /
      (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 7;
  });
  if (closingSoon) return "yellow";
  return "green";
}

function formatBRDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
          fontSize: 24,
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

// ─── Página principal ──────────────────────────────────────────────────────

type SaneamentoListContentProps = {
  showHeader?: boolean;
};

function SaneamentoListContent({
  showHeader = true,
}: SaneamentoListContentProps) {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectWithExtras[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<SanitationType | "">("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  async function loadAll(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);

    const [projectList, clientList] = await Promise.all([
      listSanitationProjects(),
      listClients(),
    ]);

    const ids = projectList.map((p) => p.id);
    const [phaseList, approvalList] = await Promise.all([
      listPhasesForProjects(ids),
      listApprovalsForProjects(ids),
    ]);

    setClients(clientList);
    const clientById = new Map(clientList.map((c) => [c.id, c]));

    const enriched: ProjectWithExtras[] = projectList.map((p) => ({
      ...p,
      phases: phaseList.filter((ph) => ph.project_id === p.id),
      approvals: approvalList.filter((a) => a.project_id === p.id),
      client: p.client_id ? clientById.get(p.client_id) ?? null : null,
    }));

    setProjects(enriched);
    if (!silent) setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  // ─── Risk counts ─────────────────────────────────────────────────────────

  const riskCounts = useMemo(() => {
    const counts = { all: projects.length, green: 0, yellow: 0, red: 0 };
    for (const p of projects) {
      const risk = getProjectRisk(p.approvals);
      counts[risk] += 1;
    }
    return counts;
  }, [projects]);

  // ─── Filtered list ───────────────────────────────────────────────────────

  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.municipality?.toLowerCase().includes(term) ?? false) ||
        (p.contract_number?.toLowerCase().includes(term) ?? false);
      const matchesClient = !clientFilter || p.client_id === clientFilter;
      const matchesType = !typeFilter || p.sanitation_type === typeFilter;
      const matchesRisk =
        riskFilter === "all" || getProjectRisk(p.approvals) === riskFilter;
      return matchesSearch && matchesClient && matchesType && matchesRisk;
    });
  }, [projects, search, clientFilter, typeFilter, riskFilter]);

  // ─── Portfolio stats ─────────────────────────────────────────────────────

  const portfolioStats = useMemo(() => {
    const total = projects.length;
    let openApprovals = 0;
    let overdueApprovals = 0;
    let totalValue = 0;
    let populationServed = 0;
    let avgProgressSum = 0;
    let projectsWithPhases = 0;
    const today = new Date().toISOString().slice(0, 10);

    projects.forEach((p) => {
      totalValue += Number(p.contract_value || 0);
      populationServed += Number(p.population_final || 0);

      if (p.phases.length > 0) {
        avgProgressSum += getProjectProgress(p.phases);
        projectsWithPhases += 1;
      }

      p.approvals.forEach((a) => {
        if (
          a.status !== "approved" &&
          a.status !== "rejected" &&
          a.status !== "cancelled"
        ) {
          openApprovals += 1;
          if (
            a.expected_response_date &&
            a.expected_response_date < today
          )
            overdueApprovals += 1;
        }
      });
    });

    const avgProgress =
      projectsWithPhases > 0 ? Math.round(avgProgressSum / projectsWithPhases) : 0;

    return {
      total,
      openApprovals,
      overdueApprovals,
      totalValue,
      populationServed,
      avgProgress,
    };
  }, [projects]);

  const hasFilter = !!(
    search ||
    clientFilter ||
    typeFilter ||
    riskFilter !== "all"
  );

  function clearAllFilters() {
    setSearch("");
    setClientFilter("");
    setTypeFilter("");
    setRiskFilter("all");
  }

  // ─── Card renderer ───────────────────────────────────────────────────────

  function renderProjectCard(project: ProjectWithExtras, isList: boolean) {
    const currentPhase = getCurrentPhase(project.phases);
    const progress = getProjectProgress(project.phases);
    const nextApproval = getNextOpenApproval(project.approvals);
    const risk = getProjectRisk(project.approvals);
    const riskCfg = RISK_CONFIG[risk];

    return (
      <div
        key={project.id}
        onClick={() => router.push(`/saneamento/${project.id}`)}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
          cursor: "pointer",
          transition: "transform 160ms ease, box-shadow 160ms ease",
          boxShadow: "var(--shadow-sm)",
        }}
        className="task-card-hover"
      >
        {/* Risk stripe */}
        <div
          style={{
            height: 4,
            background: `linear-gradient(90deg, ${riskCfg.color} 0%, ${riskCfg.color}88 100%)`,
          }}
        />

        <div style={{ padding: 18 }}>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: riskCfg.soft,
                  color: riskCfg.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Droplets size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      margin: 0,
                      letterSpacing: "-0.01em",
                      color: "var(--foreground)",
                    }}
                  >
                    {project.name}
                  </h3>
                  {project.sanitation_type && (
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: "var(--info-soft)",
                        color: "var(--info-fg)",
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {sanitationTypeShort[project.sanitation_type]}
                    </span>
                  )}
                  <span
                    style={{
                      padding: "3px 10px",
                      borderRadius: 999,
                      background: riskCfg.soft,
                      color: riskCfg.fg,
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
                        background: riskCfg.color,
                      }}
                    />
                    {riskCfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted flex-wrap">
                  {project.client && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 size={11} />
                      {project.client.short_name || project.client.name}
                    </span>
                  )}
                  {project.municipality && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={11} />
                      {project.municipality}
                      {project.state ? ` / ${project.state}` : ""}
                    </span>
                  )}
                  {project.contract_number && (
                    <span className="inline-flex items-center gap-1">
                      <FileText size={11} />
                      Nº {project.contract_number}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <ChevronRight
              size={18}
              className="text-muted"
              style={{ flexShrink: 0, marginTop: 4 }}
            />
          </div>

          {/* 2-column inner cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isList ? "1fr 1fr" : "1fr 1fr",
              gap: 10,
            }}
          >
            <div
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div
                className="text-xs text-muted mb-1 inline-flex items-center gap-1"
                style={{ fontWeight: 500 }}
              >
                <Activity size={11} />
                Etapa atual
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--foreground)",
                  marginBottom: 8,
                }}
              >
                {currentPhase?.name || "—"}
              </div>
              <Progress
                value={progress}
                showLabel
                label="Avanço"
                variant={
                  progress === 100
                    ? "success"
                    : risk === "red"
                    ? "danger"
                    : "primary"
                }
              />
            </div>

            <div
              style={{
                background: nextApproval
                  ? riskCfg.soft
                  : "var(--success-soft)",
                border: nextApproval
                  ? `1px solid color-mix(in srgb, ${riskCfg.color} 30%, transparent)`
                  : "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div
                className="text-xs mb-1 inline-flex items-center gap-1"
                style={{
                  color: nextApproval ? riskCfg.fg : "var(--success-fg)",
                  fontWeight: 600,
                }}
              >
                <ClipboardCheck size={11} />
                Próxima aprovação
              </div>
              {nextApproval ? (
                <>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--foreground)",
                      marginBottom: 6,
                    }}
                  >
                    {nextApproval.agency}
                    {nextApproval.approval_type
                      ? ` — ${nextApproval.approval_type}`
                      : ""}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={approvalStatusVariant[nextApproval.status]}
                      dot
                    >
                      {approvalStatusLabel[nextApproval.status]}
                    </Badge>
                    {nextApproval.expected_response_date && (
                      <span className="text-xs inline-flex items-center gap-1 text-muted">
                        <CalendarDays size={11} />
                        {formatBRDate(nextApproval.expected_response_date)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--success-fg)",
                  }}
                >
                  Sem aprovações pendentes
                </div>
              )}
            </div>
          </div>

          {/* Footer with extras (only in grid view, when there's data) */}
          {!isList &&
            (project.population_final || project.contract_value) && (
              <div
                className="flex items-center gap-3 mt-3 pt-3 flex-wrap text-xs"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                {project.population_final ? (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <UsersIcon size={11} />
                    <strong style={{ color: "var(--foreground)" }}>
                      {project.population_final.toLocaleString("pt-BR")}
                    </strong>{" "}
                    hab
                  </span>
                ) : null}
                {project.contract_value ? (
                  <span className="inline-flex items-center gap-1 text-muted">
                    <Building2 size={11} />
                    <strong style={{ color: "var(--foreground)" }}>
                      {Number(project.contract_value).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </strong>
                  </span>
                ) : null}
              </div>
            )}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div>
      {showHeader && (
        <PageHeader
          title="Projetos de Saneamento"
          description="Carteira de projetos de SAA e SES — concepção, licenciamento, executivo e aprovações."
          actions={
            <Button leftIcon={<Plus size={16} />} onClick={() => setShowModal(true)}>
              Novo projeto
            </Button>
          }
        />
      )}

      {/* ─── Top stats ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 20,
        }}
      >
        <StatTile
          label="Projetos ativos"
          value={portfolioStats.total}
          icon={<Droplets size={18} />}
          variant="primary"
          hint={
            riskCounts.green > 0 || riskCounts.red > 0
              ? `${riskCounts.green} saudáveis · ${riskCounts.red} urgentes`
              : undefined
          }
        />
        <StatTile
          label="Aprovações em aberto"
          value={portfolioStats.openApprovals}
          icon={<ClipboardCheck size={18} />}
          variant="warning"
          hint={
            portfolioStats.overdueApprovals > 0
              ? `${portfolioStats.overdueApprovals} vencidas`
              : "Tudo em dia"
          }
        />
        <StatTile
          label="Avanço médio das fases"
          value={`${portfolioStats.avgProgress}%`}
          icon={<TrendingUp size={18} />}
          variant="success"
        />
        <StatTile
          label="Valor de carteira"
          value={portfolioStats.totalValue.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            maximumFractionDigits: 0,
          })}
          icon={<Building2 size={18} />}
          variant="purple"
        />
        <StatTile
          label="População atendida"
          value={portfolioStats.populationServed.toLocaleString("pt-BR")}
          icon={<UsersIcon size={18} />}
          variant="info"
          hint="fim de plano"
        />
      </div>

      {/* ─── Toolbar ──────────────────────────────────────────────── */}
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
            minWidth: 200,
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
            placeholder="Buscar por nome, município ou nº de contrato…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
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
            label="Urgente"
            count={riskCounts.red}
            onClick={() => setRiskFilter("red")}
            color={RISK_CONFIG.red.color}
          />
        </div>

        <div
          className="flex items-center gap-2"
          style={{ borderLeft: "1px solid var(--border)", paddingLeft: 10 }}
        >
          <Filter size={14} className="text-muted" />
          <Select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            style={{ minWidth: 160, width: "auto" }}
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name || c.name}
              </option>
            ))}
          </Select>
          <Select
            value={typeFilter}
            onChange={(e) =>
              setTypeFilter(e.target.value as SanitationType | "")
            }
            style={{ minWidth: 130, width: "auto" }}
          >
            <option value="">Todos os tipos</option>
            <option value="SAA">SAA</option>
            <option value="SES">SES</option>
            <option value="SAA_SES">SAA+SES</option>
          </Select>
          {hasFilter && (
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
            onClick={() => setViewMode("grid")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              background: viewMode === "grid" ? "var(--surface)" : "transparent",
              color:
                viewMode === "grid" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: viewMode === "grid" ? "var(--shadow-sm)" : "none",
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
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 14,
          }}
        >
          <SkeletonCard height={220} />
          <SkeletonCard height={220} />
          <SkeletonCard height={220} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Droplets size={22} />}
          title="Nenhum projeto cadastrado"
          description="Cadastre seu primeiro projeto de saneamento. As etapas técnicas são criadas automaticamente."
          action={
            <Button leftIcon={<Plus size={16} />} onClick={() => setShowModal(true)}>
              Criar projeto
            </Button>
          }
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Search size={22} />}
          title="Nenhum projeto nestes filtros"
          description="Tente outro termo de busca ou limpe os filtros."
          action={
            <Button variant="ghost" onClick={clearAllFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              viewMode === "grid"
                ? "repeat(auto-fill, minmax(400px, 1fr))"
                : "1fr",
            gap: 14,
          }}
        >
          {filteredProjects.map((project) =>
            renderProjectCard(project, viewMode === "list")
          )}
        </div>
      )}

      {/* ─── Footer summary ─────────────────────────────────────── */}
      {!loading && filteredProjects.length > 0 && (
        <div
          className="flex items-center justify-between gap-2 flex-wrap mt-4 text-xs text-muted"
          style={{ paddingInline: 4 }}
        >
          <span className="inline-flex items-center gap-1">
            <Activity size={12} />
            Mostrando <strong>{filteredProjects.length}</strong> de{" "}
            <strong>{projects.length}</strong> projetos
          </span>
          {portfolioStats.avgProgress > 0 && (
            <span className="inline-flex items-center gap-1">
              <TrendingUp size={12} />
              Avanço médio:{" "}
              <strong>{portfolioStats.avgProgress}%</strong>
            </span>
          )}
        </div>
      )}

      <NewProjectModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(id) => {
          setShowModal(false);
          router.push(`/saneamento/${id}`);
        }}
      />
    </div>
  );
}

export default function SaneamentoListPage() {
  return <SaneamentoListContent />;
}
