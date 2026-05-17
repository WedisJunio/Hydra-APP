"use client";

/**
 * ProjectTaskBoard
 * ─────────────────────────────────────────────────────────────────────────────
 * Painel ClickUp-like (Quadro / Lista / Gantt) usado dentro da página de
 * Espaços quando um nó (lista ou pasta) está selecionado.
 *
 * Props:
 *  - projectIds  : IDs dos projetos cujas tarefas devem ser exibidas
 *  - nodeLabel   : Nome do nó selecionado (para mensagens de estado vazio)
 *  - podeEditar  : Se o usuário pode criar / mover / excluir tarefas
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  X,
  Filter,
  Users,
  Search,
  Settings,
  ArrowDown,
  LayoutGrid,
  List,
  BarChart2,
  Circle,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Flag,
  Calendar,
  MoreHorizontal,
  ListTodo,
  Layers,
  Briefcase,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import {
  getSupabaseErrorMessage,
  logSupabaseUnlessJwt,
} from "@/lib/supabase/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KanbanColumnsEditor } from "@/components/spaces/kanban-columns-editor";
import type { KanbanColumnDef } from "@/lib/workspaces/spaces-shared";
import { parseKanbanColumns, DEFAULT_KANBAN_COLUMNS } from "@/lib/workspaces/spaces-shared";

// ─── Status config ────────────────────────────────────────────────────────────

export type StatusKey =
  | "previsto"
  | "planejado"
  | "em_andamento"
  | "paralisado"
  | "cancelado"
  | "aprovacao_copasa";

type StatusConfig = {
  label: string;
  /** Cor semântica: mantemos cores fixas só para status (dado semântico, não visual) */
  color: string;
  bg: string;
  border: string;
  Icon: LucideIcon;
};

export const STATUSES: Record<StatusKey, StatusConfig> = {
  previsto:         { label: "PREVISTO",        color: "#64748b", bg: "color-mix(in srgb,#64748b 10%,transparent)", border: "color-mix(in srgb,#64748b 25%,transparent)", Icon: Circle      },
  planejado:        { label: "PLANEJADO",        color: "#c026d3", bg: "color-mix(in srgb,#c026d3 10%,transparent)", border: "color-mix(in srgb,#c026d3 25%,transparent)", Icon: Clock       },
  em_andamento:     { label: "EM ANDAMENTO",     color: "#d97706", bg: "color-mix(in srgb,#d97706 10%,transparent)", border: "color-mix(in srgb,#d97706 25%,transparent)", Icon: PlayCircle  },
  paralisado:       { label: "PARALISADO",       color: "#dc2626", bg: "color-mix(in srgb,#dc2626 10%,transparent)", border: "color-mix(in srgb,#dc2626 25%,transparent)", Icon: PauseCircle },
  cancelado:        { label: "CANCELADO",        color: "#94a3b8", bg: "color-mix(in srgb,#94a3b8 10%,transparent)", border: "color-mix(in srgb,#94a3b8 25%,transparent)", Icon: XCircle     },
  aprovacao_copasa: { label: "APROVAÇÃO COPASA", color: "#2563eb", bg: "color-mix(in srgb,#2563eb 10%,transparent)", border: "color-mix(in srgb,#2563eb 25%,transparent)", Icon: CheckCircle2},
};

export const STATUS_ORDER: StatusKey[] = [
  "previsto", "planejado", "em_andamento", "paralisado", "cancelado", "aprovacao_copasa",
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:    { label: "Baixa",   color: "#6b7280" },
  normal: { label: "Normal",  color: "#3b82f6" },
  high:   { label: "Alta",    color: "#f59e0b" },
  urgent: { label: "Urgente", color: "#ef4444" },
};

const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  "projeto básico": { bg: "#dcfce7", color: "#15803d" },
  "rev. básico":    { bg: "#e0e7ff", color: "#4338ca" },
  "orçamento":      { bg: "#fef3c7", color: "#b45309" },
  "topografia":     { bg: "#fce7f3", color: "#be185d" },
  "executivo":      { bg: "#f0fdf4", color: "#166534" },
  "licitação":      { bg: "#fff7ed", color: "#c2410c" },
  "aprovado":       { bg: "#dcfce7", color: "#15803d" },
  "revisão":        { bg: "#fef3c7", color: "#b45309" },
};

// ─── Dynamic status builder (custom columns) ──────────────────────────────────

const ICON_CYCLE: LucideIcon[] = [Circle, Clock, PlayCircle, PauseCircle, CheckCircle2, XCircle];

export function buildDynamicStatuses(cols: KanbanColumnDef[]): {
  statuses: Record<string, StatusConfig>;
  order: string[];
} {
  const statuses: Record<string, StatusConfig> = {};
  cols.forEach((col, i) => {
    const color = col.color ?? "#6366f1";
    statuses[col.key] = {
      label: col.label.toUpperCase(),
      color,
      bg:     `color-mix(in srgb,${color} 10%,transparent)`,
      border: `color-mix(in srgb,${color} 25%,transparent)`,
      Icon:   ICON_CYCLE[i % ICON_CYCLE.length],
    };
  });
  return { statuses, order: cols.map((c) => c.key) };
}

// ─── Task type ────────────────────────────────────────────────────────────────

export type ProjectTask = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  planned_due_date: string | null;
  project_id: string | null;
  assigned_to: string | null;
  description: string | null;
  created_at: string;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

export function normalizeStatus(s: string | null | undefined): StatusKey {
  if (!s) return "previsto";
  if (s in STATUSES) return s as StatusKey;
  if (s === "in_progress") return "em_andamento";
  if (s === "completed")   return "aprovacao_copasa";
  if (s === "cancelled")   return "cancelado";
  if (s === "pending")     return "previsto";
  return "previsto";
}

function parseTitle(title: string) {
  const osMatch = title.match(/^(OS\s+[\d.]+)\s*[-–]\s*/i);
  const osCode = osMatch ? osMatch[1].toUpperCase() : null;
  const rest = osCode ? title.slice(osMatch![0].length) : title;
  const systems = ["SAA", "SES", "EEEB", "ETA", "ETE"];
  for (const sys of systems) {
    const m = rest.match(new RegExp(`^${sys}\\s*[-–]\\s*(.+)`, "i"));
    if (m) return { osCode, systemType: sys, municipality: m[1].trim() };
  }
  return { osCode, systemType: null, municipality: rest.trim() };
}

function extractTags(desc: string | null): string[] {
  if (!desc) return [];
  return (desc.match(/#([\w\s.áéíóúàâêîôûãõç]+)/gi) ?? [])
    .map((m) => m.slice(1).trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length < 30)
    .slice(0, 4);
}

function fmtDate(d: string | null) {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  catch { return null; }
}

function overdue(task: ProjectTask) {
  if (!task.planned_due_date) return false;
  const k = normalizeStatus(task.status);
  if (k === "aprovacao_copasa" || k === "cancelado") return false;
  return new Date(task.planned_due_date) < new Date();
}

// ─── Small components ─────────────────────────────────────────────────────────

function Chip({ label, icon, active }: { label: string; icon?: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      style={{
        background: active ? "var(--primary-soft, color-mix(in srgb,var(--primary) 12%,transparent))" : "none",
        border: `1px solid ${active ? "color-mix(in srgb,var(--primary) 35%,transparent)" : "transparent"}`,
        borderRadius: "var(--radius-sm, 5px)", padding: "3px 8px", fontSize: 11,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--primary)" : "var(--muted-fg)",
        cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "transparent"; } }}
    >
      {icon}{label}
    </button>
  );
}

function TagPill({ tag }: { tag: string }) {
  const s = TAG_STYLES[tag] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {tag}
    </span>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: ProjectTask; onClick: () => void }) {
  const { osCode, systemType, municipality } = parseTitle(task.title);
  const tags = extractTags(task.description);
  const due  = fmtDate(task.planned_due_date);
  const late = overdue(task);
  const prio = PRIORITY_CONFIG[task.priority ?? "normal"];

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--background)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 8,
        cursor: "pointer", transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb,var(--primary) 40%,transparent)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
    >
      {osCode && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", letterSpacing: "0.03em", marginBottom: 3 }}>{osCode}</div>
      )}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.45, marginBottom: tags.length ? 8 : 10 }}>
        {systemType && <span style={{ color: "#6366f1", marginRight: 4 }}>{systemType} -</span>}
        {municipality || task.title}
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {tags.map((t) => <TagPill key={t} tag={t} />)}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 5, color: "var(--border)" }}>
          <Users size={11} /><Calendar size={11} />
          <Flag size={11} style={{ color: task.priority === "urgent" ? "#ef4444" : task.priority === "high" ? "#f59e0b" : "var(--border)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {prio && task.priority && task.priority !== "normal" && (
            <span style={{ fontSize: 9, fontWeight: 700, color: prio.color, textTransform: "uppercase" }}>{prio.label}</span>
          )}
          {due && <span style={{ fontSize: 10, fontWeight: 500, color: late ? "#ef4444" : "var(--muted-fg)" }}>{due}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanCol({ statusKey, tasks, onAdd, onTaskClick }: {
  statusKey: StatusKey; tasks: ProjectTask[];
  onAdd: () => void; onTaskClick: (t: ProjectTask) => void;
}) {
  const cfg = STATUSES[statusKey];
  const Ic = cfg.Icon;
  return (
    <div style={{ flexShrink: 0, width: 268, display: "flex", flexDirection: "column", background: cfg.bg, borderRadius: "var(--radius-lg)", border: `1px solid ${cfg.border}`, maxHeight: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "9px 10px", borderBottom: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <Ic size={12} style={{ color: cfg.color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>{cfg.label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}28`, borderRadius: 20, padding: "1px 7px" }}>{tasks.length}</span>
        <button type="button" onClick={onAdd} style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, opacity: 0.6, padding: 2, borderRadius: "var(--radius-sm)", display: "flex" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = cfg.bg; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.background = "none"; }}>
          <Plus size={13} />
        </button>
        <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, opacity: 0.45, padding: 2, borderRadius: "var(--radius-sm)", display: "flex" }}>
          <MoreHorizontal size={13} />
        </button>
      </div>
      {/* Tasks */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 8px 4px" }}>
        {tasks.map((t) => <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />)}
        <button type="button" onClick={onAdd}
          style={{ width: "100%", background: "none", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4, transition: "all 0.12s" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.color = cfg.color; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-fg)"; }}>
          <Plus size={11} /> Adicionar Tarefa
        </button>
      </div>
    </div>
  );
}

// ─── Dynamic views (support custom statuses) ──────────────────────────────────

type DynViewProps = {
  tasks: ProjectTask[];
  statuses: Record<string, StatusConfig>;
  order: string[];
};

function DynamicKanbanView({ tasks, statuses, order, onAdd, onTaskClick }: DynViewProps & {
  onAdd: (s: string) => void; onTaskClick: (t: ProjectTask) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<string, ProjectTask[]> = {};
    for (const k of order) m[k] = [];
    for (const t of tasks) {
      const k = order.includes(t.status) ? t.status : (order.includes(normalizeStatus(t.status)) ? normalizeStatus(t.status) : order[0]);
      if (k && m[k]) m[k].push(t); else if (order[0]) m[order[0]].push(t);
    }
    return m;
  }, [tasks, order]);

  return (
    <div style={{ display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden", height: "100%", padding: "14px 16px", alignItems: "flex-start" }}>
      {order.map((key) => {
        const cfg = statuses[key];
        if (!cfg) return null;
        const Ic = cfg.Icon;
        return (
          <div key={key} style={{ flexShrink: 0, width: 268, display: "flex", flexDirection: "column", background: cfg.bg, borderRadius: "var(--radius-lg)", border: `1px solid ${cfg.border}`, maxHeight: "100%", overflow: "hidden" }}>
            <div style={{ padding: "9px 10px", borderBottom: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Ic size={12} style={{ color: cfg.color, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>{cfg.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: `${cfg.color}28`, borderRadius: 20, padding: "1px 7px" }}>{(grouped[key] ?? []).length}</span>
              <button type="button" onClick={() => onAdd(key)} style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, opacity: 0.6, padding: 2, borderRadius: "var(--radius-sm)", display: "flex" }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}>
                <Plus size={13} />
              </button>
              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: cfg.color, opacity: 0.45, padding: 2, borderRadius: "var(--radius-sm)", display: "flex" }}>
                <MoreHorizontal size={13} />
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 8px 4px" }}>
              {(grouped[key] ?? []).map((t) => <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />)}
              <button type="button" onClick={() => onAdd(key)}
                style={{ width: "100%", background: "none", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 10px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4, transition: "all 0.12s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = cfg.color; e.currentTarget.style.color = cfg.color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-fg)"; }}>
                <Plus size={11} /> Adicionar Tarefa
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dynamic list view ────────────────────────────────────────────────────────

function DynamicListView({ tasks, statuses, order, onTaskClick }: DynViewProps & { onTaskClick: (t: ProjectTask) => void }) {
  const sorted = [...tasks].sort((a, b) => {
    const ai = order.indexOf(a.status) >= 0 ? order.indexOf(a.status) : order.indexOf(normalizeStatus(a.status));
    const bi = order.indexOf(b.status) >= 0 ? order.indexOf(b.status) : order.indexOf(normalizeStatus(b.status));
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  return (
    <div style={{ overflowY: "auto", height: "100%", padding: "0 16px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: "2px solid var(--border)", padding: "8px 0", position: "sticky", top: 0, background: "var(--surface)", zIndex: 5 }}>
        {[["OS", 72], ["Tarefa / Município", "auto"], ["Tipo", 60], ["Status", 180], ["Prioridade", 84], ["Prazo", 84]].map(([col, w]) => (
          <div key={col as string} style={{ width: w === "auto" ? "auto" : w as number, flex: w === "auto" ? 1 : "none", fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 8px", whiteSpace: "nowrap" }}>{col}</div>
        ))}
      </div>
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted-fg)" }}>
          <ListTodo size={40} style={{ margin: "0 auto 12px", opacity: 0.2 }} />
          <p style={{ fontSize: 13, fontWeight: 600 }}>Nenhuma tarefa encontrada</p>
        </div>
      )}
      {sorted.map((task) => {
        const { osCode, systemType, municipality } = parseTitle(task.title);
        const sk = order.includes(task.status) ? task.status : (order.includes(normalizeStatus(task.status)) ? normalizeStatus(task.status) : order[0]);
        const cfg = statuses[sk ?? ""] ?? statuses[order[0]];
        if (!cfg) return null;
        const SIcon = cfg.Icon;
        const due = fmtDate(task.planned_due_date);
        const late = overdue(task);
        const tags = extractTags(task.description);
        const prio = PRIORITY_CONFIG[task.priority ?? "normal"];
        return (
          <div key={task.id} onClick={() => onTaskClick(task)}
            style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", padding: "8px 0", cursor: "pointer", transition: "background 0.1s", minHeight: 44 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
            <div style={{ width: 72, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--muted-fg)", padding: "0 8px", whiteSpace: "nowrap" }}>{osCode ?? "—"}</div>
            <div style={{ flex: 1, padding: "0 8px", minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{municipality || task.title}</div>
              {tags.length > 0 && <div style={{ display: "flex", gap: 3, marginTop: 3 }}>{tags.map((t) => <TagPill key={t} tag={t} />)}</div>}
            </div>
            <div style={{ width: 60, flexShrink: 0, padding: "0 8px" }}>
              {systemType ? <Badge variant="neutral" style={{ fontSize: 9, padding: "1px 5px" }}>{systemType}</Badge> : <span style={{ color: "var(--border)" }}>—</span>}
            </div>
            <div style={{ width: 180, flexShrink: 0, padding: "0 8px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                <SIcon size={10} style={{ color: cfg.color }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>
              </div>
            </div>
            <div style={{ width: 84, flexShrink: 0, padding: "0 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: prio?.color ?? "var(--muted-fg)" }}>{prio?.label ?? "—"}</span>
            </div>
            <div style={{ width: 84, flexShrink: 0, padding: "0 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: late ? "#ef4444" : "var(--muted-fg)" }}>{due ?? "—"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dynamic Gantt view ───────────────────────────────────────────────────────

function DynamicGanttView({ tasks, statuses, order }: DynViewProps) {
  const today = new Date();
  const withDates = tasks.filter((t) => t.planned_due_date);
  if (withDates.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-fg)", gap: 10 }}>
        <BarChart2 size={40} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: 13, fontWeight: 600 }}>Nenhuma tarefa com prazo definido</p>
        <p style={{ fontSize: 11 }}>Adicione prazos às tarefas para visualizá-las no Gantt.</p>
      </div>
    );
  }
  const allDates = withDates.map((t) => new Date(t.planned_due_date!)).filter((d) => !isNaN(d.getTime()));
  const minD = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxD = new Date(Math.max(...allDates.map((d) => d.getTime())));
  minD.setDate(minD.getDate() - 14);
  maxD.setDate(maxD.getDate() + 21);
  const totalDays = Math.max(1, Math.ceil((maxD.getTime() - minD.getTime()) / 86400000));
  const DAY_W = 28; const LEFT = 248;
  const todayOff = Math.floor((today.getTime() - minD.getTime()) / 86400000);
  const months: { label: string; days: number }[] = [];
  let cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
  while (cur <= maxD) {
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const cs = cur < minD ? minD : cur;
    const ce = end > maxD ? maxD : end;
    months.push({ label: cur.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }), days: Math.ceil((ce.getTime() - cs.getTime()) / 86400000) + 1 });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return (
    <div style={{ overflowX: "auto", overflowY: "auto", height: "100%", padding: 16 }}>
      <div style={{ minWidth: LEFT + totalDays * DAY_W, position: "relative" }}>
        <div style={{ display: "flex", marginLeft: LEFT, borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 4 }}>
          {months.map((m, i) => (
            <div key={i} style={{ width: m.days * DAY_W, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "var(--foreground)", padding: "6px 8px", borderRight: "1px solid var(--border)", background: "var(--surface-2)", textTransform: "capitalize" }}>{m.label}</div>
          ))}
        </div>
        {todayOff >= 0 && todayOff <= totalDays && (
          <div style={{ position: "absolute", left: LEFT + todayOff * DAY_W, top: 32, bottom: 0, width: 2, background: "#ef4444", opacity: 0.4, zIndex: 3, pointerEvents: "none" }} />
        )}
        {withDates.map((task) => {
          const { osCode, systemType, municipality } = parseTitle(task.title);
          const endDate = new Date(task.planned_due_date!);
          const startDate = new Date(task.created_at);
          const startOff = Math.max(0, Math.floor((startDate.getTime() - minD.getTime()) / 86400000));
          const endOff = Math.floor((endDate.getTime() - minD.getTime()) / 86400000);
          const barW = Math.max(DAY_W, (endOff - startOff) * DAY_W);
          const sk = order.includes(task.status) ? task.status : (order.includes(normalizeStatus(task.status)) ? normalizeStatus(task.status) : order[0]);
          const cfg = statuses[sk ?? ""] ?? statuses[order[0]];
          if (!cfg) return null;
          return (
            <div key={task.id} style={{ display: "flex", alignItems: "center", height: 44, borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: LEFT, flexShrink: 0, padding: "0 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderRight: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 5 }}>
                <cfg.Icon size={11} style={{ color: cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11 }}>
                  {osCode && <span style={{ color: "var(--muted-fg)", marginRight: 3 }}>{osCode}</span>}
                  {systemType && <span style={{ color: "#6366f1", marginRight: 3 }}>{systemType}</span>}
                  <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{municipality || task.title}</span>
                </span>
              </div>
              <div style={{ position: "relative", flex: 1, height: "100%", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: startOff * DAY_W, top: "50%", transform: "translateY(-50%)", width: barW, height: 24, background: cfg.color, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8, overflow: "hidden", opacity: 0.85 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{municipality || task.title}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Dynamic detail side panel ───────────────────────────────────────────────

function DynamicDetailPanel({ task, statuses, order, onClose, onStatusChange, onDelete, podeEditar }: {
  task: ProjectTask;
  statuses: Record<string, StatusConfig>;
  order: string[];
  onClose: () => void;
  onStatusChange: (id: string, s: string) => void;
  onDelete: (id: string) => void;
  podeEditar: boolean;
}) {
  const { osCode, systemType, municipality } = parseTitle(task.title);
  const sk = order.includes(task.status) ? task.status : (order.includes(normalizeStatus(task.status)) ? normalizeStatus(task.status) : order[0]);
  const cfg = statuses[sk ?? ""] ?? statuses[order[0]];
  const SIcon = cfg?.Icon ?? Circle;
  const tags = extractTags(task.description);
  const due  = fmtDate(task.planned_due_date);
  const late = overdue(task);

  return (
    <div style={{ width: 360, flexShrink: 0, background: "var(--background)", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
          <SIcon size={11} style={{ color: cfg.color }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          {podeEditar && (
            <button type="button" onClick={() => onDelete(task.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: 4, borderRadius: 5, display: "flex" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "#fef2f2"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.background = "none"; }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg>
            </button>
          )}
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: 4, borderRadius: 5, display: "flex" }}>
            <X size={14} />
          </button>
        </div>
      </div>

      <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
        {osCode && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)", marginBottom: 3 }}>{osCode}</div>}
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)", marginBottom: 10, lineHeight: 1.4 }}>
          {systemType && <span style={{ color: "#6366f1" }}>{systemType} - </span>}
          {municipality || task.title}
        </h2>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
            {tags.map((t) => <TagPill key={t} tag={t} />)}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Prazo</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: late ? "#ef4444" : "var(--foreground)" }}>
              {due ?? "Não definido"}{late && <span style={{ fontSize: 10, marginLeft: 4, color: "#ef4444" }}>· Atrasado</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Prioridade</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: PRIORITY_CONFIG[task.priority ?? "normal"]?.color ?? "var(--muted-fg)" }}>
              {PRIORITY_CONFIG[task.priority ?? "normal"]?.label ?? "—"}
            </div>
          </div>
        </div>

        {podeEditar && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 }}>Mover para</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {order.filter((s) => s !== sk).map((s) => {
                const c = statuses[s]; if (!c) return null; const I = c.Icon;
                return (
                  <button key={s} type="button" onClick={() => onStatusChange(task.id, s)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`, cursor: "pointer", fontSize: 10, fontWeight: 700, color: c.color, transition: "opacity 0.1s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
                    <I size={10} />{c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {task.description && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>Descrição</div>
            <p style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{task.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add task modal ───────────────────────────────────────────────────────────

function AddTaskModal({ defaultStatus, availableStatuses, statusLabels, projectId, onClose, onCreated }: {
  defaultStatus: StatusKey;
  availableStatuses?: string[];
  statusLabels?: Record<string, string>;
  projectId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const statList = availableStatuses ?? STATUS_ORDER;
  const getLabel = (k: string) => statusLabels?.[k] ?? STATUSES[k as StatusKey]?.label ?? k;

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>(statList.includes(defaultStatus) ? defaultStatus : statList[0] ?? defaultStatus);
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(), status, priority,
      planned_due_date: dueDate || null,
      description: description || null,
      project_id: projectId,
    });
    if (error) { showErrorToast("Não foi possível criar", getSupabaseErrorMessage(error)); setLoading(false); return; }
    showSuccessToast("Tarefa criada");
    onCreated();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}>
      <div style={{ width: "100%", maxWidth: 520, background: "var(--background)", borderRadius: 12, boxShadow: "var(--shadow-lg)", overflow: "hidden", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)" }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Nova Tarefa</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", display: "flex" }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Título (padrão: OS X.XX - SISTEMA - MUNICÍPIO)">
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleCreate(); }} placeholder="OS 4.07 - SES - ALÉM PARAÍBA" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statList.map((k) => <option key={k} value={k}>{getLabel(k)}</option>)}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITY_CONFIG).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Prazo"><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field label="Descrição (use #tag para etiquetas)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="#projeto básico, #orçamento…" />
          </Field>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--surface-2)" }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={() => void handleCreate()} loading={loading} disabled={!title.trim() || loading}>Criar Tarefa</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main export: ProjectTaskBoard ────────────────────────────────────────────

export function ProjectTaskBoard({ projectIds, nodeLabel, podeEditar, kanbanColumnsRaw, onSaveColumns }: {
  projectIds: string[];
  nodeLabel: string;
  podeEditar: boolean;
  kanbanColumnsRaw?: unknown;
  onSaveColumns?: (cols: KanbanColumnDef[]) => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"kanban" | "list" | "gantt">("kanban");
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [addModal, setAddModal] = useState<{ status: string } | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // ── Determine effective statuses (custom or default) ──────────────────────
  const { statuses: effectiveStatuses, order: effectiveOrder } = useMemo(() => {
    const cols = parseKanbanColumns(kanbanColumnsRaw);
    // If the columns exactly match the DEFAULT_KANBAN_COLUMNS keys, use hardcoded STATUSES
    // (which have semantic icons). Otherwise build dynamic ones.
    const defaultKeys = DEFAULT_KANBAN_COLUMNS.map((c) => c.key).join(",");
    const colKeys = cols.map((c) => c.key).join(",");
    if (colKeys === defaultKeys) {
      return { statuses: STATUSES as Record<string, StatusConfig>, order: STATUS_ORDER as string[] };
    }
    return buildDynamicStatuses(cols);
  }, [kanbanColumnsRaw]);

  function normalizeStatusDynamic(s: string | null | undefined): string {
    if (!s) return effectiveOrder[0] ?? "previsto";
    if (effectiveOrder.includes(s)) return s;
    // legacy mapping fallback
    const mapped = normalizeStatus(s);
    if (effectiveOrder.includes(mapped)) return mapped;
    return effectiveOrder[0] ?? "previsto";
  }

  const loadTasks = useCallback(async () => {
    if (projectIds.length === 0) { setTasks([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, status, priority, planned_due_date, project_id, assigned_to, description, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: true });
    if (error) logSupabaseUnlessJwt("[task-board]", error);
    setTasks((data ?? []) as ProjectTask[]);
    setLoading(false);
  }, [projectIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  async function handleStatusChange(id: string, status: StatusKey) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
    if (error) { showErrorToast("Erro ao atualizar", getSupabaseErrorMessage(error)); return; }
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
    if (selectedTask?.id === id) setSelectedTask((t) => t && { ...t, status });
    showSuccessToast("Status atualizado");
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esta tarefa?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { showErrorToast("Erro ao excluir", getSupabaseErrorMessage(error)); return; }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
    showSuccessToast("Tarefa excluída");
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return tasks;
    const s = search.toLowerCase();
    return tasks.filter((t) => t.title.toLowerCase().includes(s) || (t.description ?? "").toLowerCase().includes(s));
  }, [tasks, search]);

  if (projectIds.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-fg)", gap: 10 }}>
        <Briefcase size={40} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: 13, fontWeight: 600 }}>Nenhum projeto vinculado</p>
        <p style={{ fontSize: 11, maxWidth: 280, textAlign: "center" }}>
          Esta pasta não possui projetos vinculados. Vincule um projeto a uma lista para visualizar as tarefas aqui.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* View tabs + filter bar */}
      <div style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {/* Tabs row */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
          {([
            { key: "kanban", label: "Quadro",   Icon: LayoutGrid },
            { key: "list",   label: "Lista",    Icon: List },
            { key: "gantt",  label: "Gantt",    Icon: BarChart2 },
          ] as const).map(({ key, label, Icon }) => {
            const isActive = activeView === key;
            return (
              <button key={key} type="button" onClick={() => setActiveView(key)}
                style={{
                  background: "none", border: "none",
                  borderBottom: isActive ? "2px solid var(--primary)" : "2px solid transparent",
                  padding: "8px 12px", fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--primary)" : "var(--muted-fg)",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", transition: "all 0.1s",
                }}>
                <Icon size={13} />{label}
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          {/* Task counter */}
          <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 600 }}>
            {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
          </span>
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 16px 6px", flexWrap: "wrap" }}>
          <Chip label="Grupo: Status" active />
          <Chip label="Subtarefas" />
          <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 3px" }} />
          <Chip label="Classificar" icon={<ArrowDown size={10} />} />
          <Chip label="Filtro" icon={<Filter size={10} />} />
          <Chip label="Fechado" />
          <Chip label="Responsável" icon={<Users size={10} />} />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "3px 9px" }}>
            <Search size={11} style={{ color: "var(--muted-fg)", flexShrink: 0 }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar…"
              style={{ background: "none", border: "none", outline: "none", fontSize: 11, color: "var(--foreground)", width: 120 }} />
            {search && <button type="button" onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: 0, display: "flex" }}><X size={11} /></button>}
          </div>
          {podeEditar && (
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              style={{
                background: customizeOpen ? "color-mix(in srgb,var(--primary) 12%,transparent)" : "none",
                border: `1px solid ${customizeOpen ? "color-mix(in srgb,var(--primary) 35%,transparent)" : "transparent"}`,
                borderRadius: "var(--radius-sm, 5px)", padding: "3px 8px", fontSize: 11,
                fontWeight: customizeOpen ? 600 : 500,
                color: customizeOpen ? "var(--primary)" : "var(--muted-fg)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
              }}
            >
              <Settings size={10} /> Personalizar colunas
            </button>
          )}
          {podeEditar && (
            <Button size="sm" leftIcon={<Plus size={11} />} onClick={() => setAddModal({ status: effectiveOrder[0] ?? "previsto" })}>
              Add Tarefa
            </Button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 10, color: "var(--muted-fg)" }}>
              <div style={{ width: 28, height: 28, border: "3px solid var(--border)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontSize: 12 }}>Carregando tarefas…</p>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <>
              {activeView === "kanban" && (
                <DynamicKanbanView
                  tasks={filtered}
                  statuses={effectiveStatuses}
                  order={effectiveOrder}
                  onAdd={(s) => setAddModal({ status: s })}
                  onTaskClick={setSelectedTask}
                />
              )}
              {activeView === "list" && (
                <DynamicListView
                  tasks={filtered}
                  statuses={effectiveStatuses}
                  order={effectiveOrder}
                  onTaskClick={setSelectedTask}
                />
              )}
              {activeView === "gantt" && (
                <DynamicGanttView
                  tasks={filtered}
                  statuses={effectiveStatuses}
                  order={effectiveOrder}
                />
              )}
            </>
          )}
        </div>

        {selectedTask && (
          <DynamicDetailPanel
            task={selectedTask}
            statuses={effectiveStatuses}
            order={effectiveOrder}
            onClose={() => setSelectedTask(null)}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            podeEditar={podeEditar}
          />
        )}
      </div>

      {/* Customize columns panel */}
      {customizeOpen && podeEditar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: 16 }}
          onClick={() => setCustomizeOpen(false)}>
          <div style={{ width: "100%", maxWidth: 520, maxHeight: "calc(100vh - 32px)", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)", borderRadius: "var(--radius-xl) var(--radius-xl) 0 0" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Personalizar colunas</div>
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
                  Defina os status disponíveis neste board. A chave interna é salva nas tarefas.
                </div>
              </div>
              <button type="button" onClick={() => setCustomizeOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", display: "flex" }}><X size={16} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <KanbanColumnsEditor
                valueRaw={kanbanColumnsRaw}
                podeEditar={podeEditar}
                onSave={(cols) => {
                  onSaveColumns?.(cols);
                  setCustomizeOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {addModal && (
        <AddTaskModal
          defaultStatus={addModal.status as StatusKey}
          availableStatuses={effectiveOrder}
          statusLabels={Object.fromEntries(effectiveOrder.map((k) => [k, effectiveStatuses[k]?.label ?? k]))}
          projectId={projectIds[0] ?? null}
          onClose={() => setAddModal(null)}
          onCreated={() => { setAddModal(null); void loadTasks(); }}
        />
      )}
    </div>
  );
}

// ─── FolderProjectsBoard ──────────────────────────────────────────────────────
// Exibido quando uma PASTA está selecionada no Espaço.
// Mostra um painel resumo de cada projeto (lista vinculada) dentro da pasta,
// com distribuição de status das tarefas, progresso, fase atual e valor de contrato.
// Clicar em um projeto expande um painel inline com fases e detalhes do projeto.

export type FolderProjectNode = {
  nodeId: string;     // id do nó workspace_space_node (lista)
  nodeName: string;   // nome da lista (ex.: "Sistema de ampliação")
  projectId: string;  // project_id vinculado
};

// ─── Phase types ──────────────────────────────────────────────────────────────

type PhaseStatus = "pending" | "in_progress" | "in_review" | "approved" | "on_hold" | "skipped";

type FolderProjectPhase = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  order: number;
  status: PhaseStatus;
};

type FolderProjectDetails = {
  id: string;
  name: string;
  contract_value: number | null;
  municipality: string | null;
  state: string | null;
  discipline: string | null;
  contract_number: string | null;
};

const PHASE_STATUS_CFG: Record<PhaseStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:     { label: "Pendente",      color: "#64748b", bg: "color-mix(in srgb,#64748b 10%,transparent)", border: "color-mix(in srgb,#64748b 25%,transparent)" },
  in_progress: { label: "Em andamento", color: "#d97706", bg: "color-mix(in srgb,#d97706 10%,transparent)", border: "color-mix(in srgb,#d97706 25%,transparent)" },
  in_review:   { label: "Em análise",   color: "#7c3aed", bg: "color-mix(in srgb,#7c3aed 10%,transparent)", border: "color-mix(in srgb,#7c3aed 25%,transparent)" },
  approved:    { label: "Aprovada",     color: "#16a34a", bg: "color-mix(in srgb,#16a34a 10%,transparent)", border: "color-mix(in srgb,#16a34a 25%,transparent)" },
  on_hold:     { label: "Em espera",    color: "#c026d3", bg: "color-mix(in srgb,#c026d3 10%,transparent)", border: "color-mix(in srgb,#c026d3 25%,transparent)" },
  skipped:     { label: "Não aplic.",   color: "#94a3b8", bg: "color-mix(in srgb,#94a3b8 10%,transparent)", border: "color-mix(in srgb,#94a3b8 25%,transparent)" },
};

const ALL_PHASE_STATUSES: PhaseStatus[] = ["pending", "in_progress", "in_review", "approved", "on_hold", "skipped"];

function fmtBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

// ─── StatusBar ────────────────────────────────────────────────────────────────

function StatusBar({ counts }: { counts: Record<StatusKey, number> }) {
  const total = STATUS_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (total === 0) return <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Sem tarefas</span>;
  return (
    <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", width: "100%", gap: 1 }}>
      {STATUS_ORDER.map((k) => {
        const pct = total > 0 ? ((counts[k] ?? 0) / total) * 100 : 0;
        if (pct === 0) return null;
        return <div key={k} style={{ width: `${pct}%`, background: STATUSES[k].color, borderRadius: 2 }} title={`${STATUSES[k].label}: ${counts[k]}`} />;
      })}
    </div>
  );
}

// ─── PhaseSelector (inline dropdown) ─────────────────────────────────────────

function PhaseStatusBadge({ status, phaseId, onUpdate }: {
  status: PhaseStatus;
  phaseId: string;
  onUpdate: (phaseId: string, newStatus: PhaseStatus) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cfg = PHASE_STATUS_CFG[status];

  async function pick(s: PhaseStatus) {
    if (s === status) { setOpen(false); return; }
    setSaving(true);
    await onUpdate(phaseId, s);
    setSaving(false);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        disabled={saving}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
          cursor: "pointer", whiteSpace: "nowrap", opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "…" : cfg.label}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.15)", minWidth: 140, padding: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {ALL_PHASE_STATUSES.map((s) => {
            const c = PHASE_STATUS_CFG[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => void pick(s)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: s === status ? c.bg : "transparent",
                  color: c.color, border: "none", cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = c.bg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = s === status ? c.bg : "transparent"; }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ProjectExpandedPanel ─────────────────────────────────────────────────────

function ProjectExpandedPanel({ project, phases, onUpdatePhase, onOpenTasks }: {
  project: FolderProjectDetails | undefined;
  phases: FolderProjectPhase[];
  onUpdatePhase: (phaseId: string, status: PhaseStatus) => Promise<void>;
  onOpenTasks: () => void;
}) {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const currentPhase = sorted.find((p) => p.status === "in_progress") ?? sorted.find((p) => p.status === "in_review") ?? null;

  return (
    <div
      style={{ borderTop: "1px solid var(--border)", padding: "16px 16px 12px", background: "var(--surface)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Project meta row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 16 }}>
        {/* Contract value */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Valor do Contrato</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: project?.contract_value ? "var(--primary)" : "var(--muted-fg)" }}>
            {fmtBRL(project?.contract_value)}
          </div>
        </div>

        {/* Contract number */}
        {project?.contract_number && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Contrato</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{project.contract_number}</div>
          </div>
        )}

        {/* Municipality / State */}
        {(project?.municipality || project?.state) && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Localização</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
              {[project.municipality, project.state].filter(Boolean).join(" — ")}
            </div>
          </div>
        )}

        {/* Discipline */}
        {project?.discipline && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Disciplina</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", textTransform: "capitalize" }}>{project.discipline}</div>
          </div>
        )}

        {/* Current phase summary */}
        {currentPhase && (
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Fase atual</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{currentPhase.name}</div>
          </div>
        )}
      </div>

      {/* Phases timeline */}
      {sorted.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Fases do projeto</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map((ph, idx) => {
              const cfg = PHASE_STATUS_CFG[ph.status];
              const isActive = ph.status === "in_progress" || ph.status === "in_review";
              return (
                <div
                  key={ph.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                    borderRadius: 8, background: isActive ? cfg.bg : "transparent",
                    border: `1px solid ${isActive ? cfg.border : "transparent"}`,
                    transition: "all 0.15s",
                  }}
                >
                  {/* Step number */}
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: ph.status === "approved" ? "#16a34a" : ph.status === "skipped" ? "var(--border)" : isActive ? cfg.color : "var(--surface-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800, color: ph.status === "approved" || isActive ? "#fff" : "var(--muted-fg)",
                  }}>
                    {ph.status === "approved" ? "✓" : ph.status === "skipped" ? "—" : idx + 1}
                  </div>

                  {/* Phase name */}
                  <span style={{
                    flex: 1, fontSize: 12, fontWeight: isActive ? 700 : 500,
                    color: ph.status === "skipped" ? "var(--muted-fg)" : "var(--foreground)",
                    textDecoration: ph.status === "skipped" ? "line-through" : "none",
                  }}>
                    {ph.name}
                  </span>

                  {/* Status badge / dropdown */}
                  <PhaseStatusBadge status={ph.status} phaseId={ph.id} onUpdate={onUpdatePhase} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No phases yet */}
      {sorted.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--muted-fg)", marginBottom: 14, fontStyle: "italic" }}>
          Nenhuma fase cadastrada. Acesse o projeto completo para adicionar etapas.
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onOpenTasks}
          style={{
            fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 8,
            background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer",
          }}
        >
          Ver tarefas do projeto →
        </button>
      </div>
    </div>
  );
}

// ─── ProjectRow ───────────────────────────────────────────────────────────────

function ProjectRow({ node, tasks, project, phases, expanded, onToggle, onOpenTasks, onUpdatePhase }: {
  node: FolderProjectNode;
  tasks: ProjectTask[];
  project: FolderProjectDetails | undefined;
  phases: FolderProjectPhase[];
  expanded: boolean;
  onToggle: () => void;
  onOpenTasks: () => void;
  onUpdatePhase: (phaseId: string, status: PhaseStatus) => Promise<void>;
}) {
  const counts = useMemo(() => {
    const m: Record<StatusKey, number> = { previsto: 0, planejado: 0, em_andamento: 0, paralisado: 0, cancelado: 0, aprovacao_copasa: 0 };
    for (const t of tasks) m[normalizeStatus(t.status)]++;
    return m;
  }, [tasks]);

  const total = tasks.length;
  const done = counts.aprovacao_copasa;
  const inProgress = counts.em_andamento;
  const paused = counts.paralisado;
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;
  const lateTasks = tasks.filter(overdue);

  const currentPhase = useMemo(() => {
    const sorted = [...phases].sort((a, b) => a.order - b.order);
    return sorted.find((p) => p.status === "in_progress") ?? sorted.find((p) => p.status === "in_review") ?? null;
  }, [phases]);

  return (
    <div
      style={{
        background: expanded ? "var(--surface)" : "var(--surface-2)",
        border: `1px solid ${expanded ? "color-mix(in srgb,var(--primary) 40%,transparent)" : "var(--border)"}`,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      {/* Row header — clickable to expand */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "12px 16px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = "var(--surface)"; }}
        onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = ""; }}
      >
        {/* Icon */}
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "color-mix(in srgb,var(--primary) 12%,var(--surface))", border: "1px solid color-mix(in srgb,var(--primary) 20%,transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Briefcase size={16} style={{ color: "var(--primary)" }} />
        </div>

        {/* Name + status bar */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {node.nodeName}
            </span>
            {currentPhase && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                background: PHASE_STATUS_CFG[currentPhase.status].bg,
                color: PHASE_STATUS_CFG[currentPhase.status].color,
                border: `1px solid ${PHASE_STATUS_CFG[currentPhase.status].border}`,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {currentPhase.name}
              </span>
            )}
          </div>
          <StatusBar counts={counts} />
        </div>

        {/* Stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {/* Contract value */}
          {project?.contract_value != null && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "var(--primary)" }}>{fmtBRL(project.contract_value)}</div>
              <div style={{ fontSize: 9, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>contrato</div>
            </div>
          )}

          {/* Task counts per status */}
          <div style={{ display: "flex", gap: 8 }}>
            {([
              { key: "em_andamento" as StatusKey, value: inProgress },
              { key: "paralisado"   as StatusKey, value: paused },
              { key: "aprovacao_copasa" as StatusKey, value: done },
            ]).map(({ key, value }) => {
              const cfg = STATUSES[key];
              const Ic = cfg.Icon;
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 3 }} title={cfg.label}>
                  <Ic size={11} style={{ color: cfg.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: value > 0 ? cfg.color : "var(--muted-fg)" }}>{value}</span>
                </div>
              );
            })}
          </div>

          {/* Late indicator */}
          {lateTasks.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", background: "#fef2f2", borderRadius: 20, padding: "1px 8px" }}>
              {lateTasks.length} atrasada{lateTasks.length > 1 ? "s" : ""}
            </span>
          )}

          {/* Progress */}
          <div style={{ textAlign: "right", minWidth: 52 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: pctDone === 100 ? STATUSES.aprovacao_copasa.color : "var(--foreground)" }}>
              {pctDone}%
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{total} tarefa{total !== 1 ? "s" : ""}</div>
          </div>

          {/* Expand chevron */}
          <div style={{ transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
            <ChevronRight size={14} style={{ color: "var(--muted-fg)" }} />
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <ProjectExpandedPanel
          project={project}
          phases={phases}
          onUpdatePhase={onUpdatePhase}
          onOpenTasks={onOpenTasks}
        />
      )}
    </div>
  );
}

// ─── FolderProjectsBoard (main export) ───────────────────────────────────────

export function FolderProjectsBoard({ projectNodes, nodeLabel, onSelectProject }: {
  projectNodes: FolderProjectNode[];
  nodeLabel: string;
  onSelectProject: (nodeId: string) => void;
}) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [projectDetails, setProjectDetails] = useState<Record<string, FolderProjectDetails>>({});
  const [phasesByProject, setPhasesByProject] = useState<Record<string, FolderProjectPhase[]>>({});
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const projectIds = useMemo(() => projectNodes.map((p) => p.projectId), [projectNodes]);

  const loadAll = useCallback(async () => {
    if (projectIds.length === 0) { setTasks([]); setProjectDetails({}); setPhasesByProject({}); return; }
    setLoading(true);

    const [tasksRes, detailsRes, phasesRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, priority, planned_due_date, project_id, assigned_to, description, created_at")
        .in("project_id", projectIds),
      supabase
        .from("projects")
        .select("id, name, contract_value, municipality, state, discipline, contract_number")
        .in("id", projectIds),
      supabase
        .from("project_phases")
        .select("id, project_id, name, code, order, status")
        .in("project_id", projectIds)
        .order("order", { ascending: true }),
    ]);

    if (tasksRes.error) logSupabaseUnlessJwt("[folder-projects-board/tasks]", tasksRes.error);
    if (detailsRes.error) logSupabaseUnlessJwt("[folder-projects-board/projects]", detailsRes.error);
    if (phasesRes.error) logSupabaseUnlessJwt("[folder-projects-board/phases]", phasesRes.error);

    setTasks((tasksRes.data ?? []) as ProjectTask[]);

    const detMap: Record<string, FolderProjectDetails> = {};
    for (const p of (detailsRes.data ?? []) as FolderProjectDetails[]) detMap[p.id] = p;
    setProjectDetails(detMap);

    const phMap: Record<string, FolderProjectPhase[]> = {};
    for (const ph of (phasesRes.data ?? []) as FolderProjectPhase[]) {
      if (!phMap[ph.project_id]) phMap[ph.project_id] = [];
      phMap[ph.project_id].push(ph);
    }
    setPhasesByProject(phMap);

    setLoading(false);
  }, [projectIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadAll(); }, [loadAll]);

  const tasksByProject = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    for (const t of tasks) {
      if (!t.project_id) continue;
      if (!map[t.project_id]) map[t.project_id] = [];
      map[t.project_id].push(t);
    }
    return map;
  }, [tasks]);

  async function handleUpdatePhase(phaseId: string, newStatus: PhaseStatus) {
    const { error } = await supabase
      .from("project_phases")
      .update({ status: newStatus })
      .eq("id", phaseId);
    if (error) {
      showErrorToast("Erro ao atualizar fase", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Fase atualizada", "");
    // Update local state
    setPhasesByProject((prev) => {
      const next = { ...prev };
      for (const pid of Object.keys(next)) {
        next[pid] = next[pid].map((ph) => ph.id === phaseId ? { ...ph, status: newStatus } : ph);
      }
      return next;
    });
  }

  const totalTasks = tasks.length;
  const totalDone  = tasks.filter((t) => normalizeStatus(t.status) === "aprovacao_copasa").length;
  const totalLate  = tasks.filter(overdue).length;

  if (projectNodes.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted-fg)", gap: 10 }}>
        <Briefcase size={40} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: 13, fontWeight: 600 }}>Nenhum projeto nesta pasta</p>
        <p style={{ fontSize: 11, maxWidth: 280, textAlign: "center" }}>
          Passe o mouse sobre a pasta no sidebar e clique em 💼+ para vincular projetos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", padding: "10px 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>
            {projectNodes.length} projeto{projectNodes.length !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>{totalTasks}</span> tarefas no total
            </span>
            {totalDone > 0 && (
              <span style={{ fontSize: 11, color: STATUSES.aprovacao_copasa.color, fontWeight: 600 }}>
                {totalDone} aprovadas
              </span>
            )}
            {totalLate > 0 && (
              <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>
                {totalLate} atrasada{totalLate !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Project list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, flexDirection: "column", gap: 10, color: "var(--muted-fg)" }}>
            <div style={{ width: 24, height: 24, border: "3px solid var(--border)", borderTopColor: "var(--primary)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projectNodes.map((node) => (
              <ProjectRow
                key={node.nodeId}
                node={node}
                tasks={tasksByProject[node.projectId] ?? []}
                project={projectDetails[node.projectId]}
                phases={phasesByProject[node.projectId] ?? []}
                expanded={expandedId === node.nodeId}
                onToggle={() => setExpandedId((prev) => prev === node.nodeId ? null : node.nodeId)}
                onOpenTasks={() => onSelectProject(node.nodeId)}
                onUpdatePhase={handleUpdatePhase}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
