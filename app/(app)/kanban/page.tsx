"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Layers,
  Folder,
  ListTodo,
  Plus,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Users,
  Settings,
  Star,
  Share2,
  Clock,
  Briefcase,
  Calendar,
  Flag,
  MoreHorizontal,
  X,
  LayoutGrid,
  List,
  BarChart2,
  ArrowDown,
  Circle,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Bot,
  Sparkles,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  getSupabaseErrorMessage,
  logSupabaseUnlessJwt,
} from "@/lib/supabase/errors";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { canEditWorkspaceNodes } from "@/lib/permissions";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Status configuration ─────────────────────────────────────────────────────

type StatusKey =
  | "previsto"
  | "planejado"
  | "em_andamento"
  | "paralisado"
  | "cancelado"
  | "aprovacao_copasa";

type StatusConfig = {
  label: string;
  color: string;
  bg: string;
  border: string;
  Icon: LucideIcon;
};

const STATUSES: Record<StatusKey, StatusConfig> = {
  previsto: {
    label: "PREVISTO",
    color: "#6b7280",
    bg: "#f3f4f6",
    border: "#d1d5db",
    Icon: Circle,
  },
  planejado: {
    label: "PLANEJADO",
    color: "#db2777",
    bg: "#fdf2f8",
    border: "#f9a8d4",
    Icon: Clock,
  },
  em_andamento: {
    label: "EM ANDAMENTO",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    Icon: PlayCircle,
  },
  paralisado: {
    label: "PARALISADO",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fca5a5",
    Icon: PauseCircle,
  },
  cancelado: {
    label: "CANCELADO",
    color: "#9ca3af",
    bg: "#f9fafb",
    border: "#e5e7eb",
    Icon: XCircle,
  },
  aprovacao_copasa: {
    label: "APROVAÇÃO COPASA",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#93c5fd",
    Icon: CheckCircle2,
  },
};

const STATUS_ORDER: StatusKey[] = [
  "previsto",
  "planejado",
  "em_andamento",
  "paralisado",
  "cancelado",
  "aprovacao_copasa",
];

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Baixa", color: "#6b7280" },
  normal: { label: "Normal", color: "#3b82f6" },
  high: { label: "Alta", color: "#f59e0b" },
  urgent: { label: "Urgente", color: "#ef4444" },
};

const TAG_STYLES: Record<string, { bg: string; color: string }> = {
  "projeto básico": { bg: "#dcfce7", color: "#15803d" },
  "rev. básico": { bg: "#e0e7ff", color: "#4338ca" },
  orçamento: { bg: "#fef3c7", color: "#b45309" },
  topografia: { bg: "#fce7f3", color: "#be185d" },
  executivo: { bg: "#f0fdf4", color: "#166534" },
  licitação: { bg: "#fff7ed", color: "#c2410c" },
  aprovado: { bg: "#dcfce7", color: "#15803d" },
  revisão: { bg: "#fef3c7", color: "#b45309" },
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type WorkspaceSpace = {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};

type WorkspaceNode = {
  id: string;
  space_id: string;
  parent_id: string | null;
  kind: "folder" | "list";
  name: string;
  color: string | null;
  sort_order: number;
  project_id: string | null;
};

type ProjectTask = {
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

// ─── Utility functions ────────────────────────────────────────────────────────

function normalizeStatus(s: string | null | undefined): StatusKey {
  if (!s) return "previsto";
  if (s in STATUSES) return s as StatusKey;
  if (s === "in_progress") return "em_andamento";
  if (s === "completed") return "aprovacao_copasa";
  if (s === "cancelled") return "cancelado";
  if (s === "pending") return "previsto";
  return "previsto";
}

function parseTaskTitle(title: string): {
  osCode: string | null;
  systemType: string | null;
  municipality: string | null;
} {
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

function extractTags(description: string | null): string[] {
  if (!description) return [];
  const matches = description.match(/#([\w\s.áéíóúàâêîôûãõç]+)/gi);
  if (!matches) return [];
  return matches
    .map((m) => m.slice(1).trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length < 30)
    .slice(0, 4);
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return null;
  }
}

function isOverdue(task: ProjectTask): boolean {
  if (!task.planned_due_date) return false;
  const k = normalizeStatus(task.status);
  if (k === "aprovacao_copasa" || k === "cancelado") return false;
  return new Date(task.planned_due_date) < new Date();
}

// ─── Space icon map ───────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  concluido: CheckCircle2,
  em_andamento: PlayCircle,
  paralisado: PauseCircle,
  aprovado: CheckCircle2,
  aprovacao: Clock,
  layers: Layers,
  briefcase: Briefcase,
  checkSquare: CheckSquare,
};

function SpaceGlyph({
  icon,
  color,
  size = 13,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  const Icon = ICON_MAP[icon] ?? Layers;
  return <Icon size={size} style={{ color }} />;
}

// ─── FilterChip ───────────────────────────────────────────────────────────────

function FilterChip({
  label,
  icon,
  active,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      style={{
        background: active ? "#eff6ff" : "none",
        border: `1px solid ${active ? "#93c5fd" : "transparent"}`,
        borderRadius: 5,
        padding: "3px 8px",
        fontSize: 11,
        fontWeight: active ? 600 : 500,
        color: active ? "#2563eb" : "#6b7280",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "#f3f4f6";
          e.currentTarget.style.borderColor = "#e5e7eb";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.borderColor = "transparent";
        }
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Tag pill ─────────────────────────────────────────────────────────────────

function TagPill({ tag }: { tag: string }) {
  const s = TAG_STYLES[tag] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 8px",
        borderRadius: 20,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {tag}
    </span>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  onClick,
}: {
  task: ProjectTask;
  onClick: () => void;
}) {
  const { osCode, systemType, municipality } = parseTaskTitle(task.title);
  const tags = extractTags(task.description);
  const due = fmtDate(task.planned_due_date);
  const overdue = isOverdue(task);
  const priority = PRIORITY_CONFIG[task.priority ?? "normal"];

  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 12px",
        marginBottom: 8,
        cursor: "pointer",
        transition: "box-shadow 0.15s, border-color 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#a5b4fc";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(99,102,241,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e5e7eb";
        e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
      }}
    >
      {/* OS Code */}
      {osCode && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#9ca3af",
            letterSpacing: "0.03em",
            marginBottom: 3,
          }}
        >
          {osCode}
        </div>
      )}

      {/* Title */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#111827",
          lineHeight: 1.45,
          marginBottom: tags.length > 0 ? 8 : 10,
        }}
      >
        {systemType && (
          <span style={{ color: "#6366f1", marginRight: 4 }}>
            {systemType} -
          </span>
        )}
        {municipality || task.title}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}
        >
          {tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 5, color: "#d1d5db" }}
        >
          <Users size={11} />
          <Calendar size={11} />
          <Flag
            size={11}
            style={{
              color:
                task.priority === "urgent"
                  ? "#ef4444"
                  : task.priority === "high"
                    ? "#f59e0b"
                    : "#d1d5db",
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {priority && task.priority && task.priority !== "normal" && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: priority.color,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {priority.label}
            </span>
          )}
          {due && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: overdue ? "#ef4444" : "#9ca3af",
              }}
            >
              {due}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Kanban column ────────────────────────────────────────────────────────────

function KanbanColumn({
  statusKey,
  tasks,
  onAddTask,
  onTaskClick,
}: {
  statusKey: StatusKey;
  tasks: ProjectTask[];
  onAddTask: () => void;
  onTaskClick: (t: ProjectTask) => void;
}) {
  const cfg = STATUSES[statusKey];
  const Ic = cfg.Icon;

  return (
    <div
      style={{
        flexShrink: 0,
        width: 272,
        display: "flex",
        flexDirection: "column",
        background: cfg.bg,
        borderRadius: 10,
        border: `1px solid ${cfg.border}`,
        maxHeight: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "9px 10px",
          borderBottom: `1px solid ${cfg.border}`,
          display: "flex",
          alignItems: "center",
          gap: 7,
          flexShrink: 0,
        }}
      >
        <Ic size={13} style={{ color: cfg.color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: cfg.color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            flex: 1,
          }}
        >
          {cfg.label}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: cfg.color,
            background: `${cfg.color}22`,
            borderRadius: 20,
            padding: "1px 7px",
            minWidth: 20,
            textAlign: "center",
          }}
        >
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={onAddTask}
          title="Adicionar tarefa"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: cfg.color,
            opacity: 0.6,
            padding: 2,
            borderRadius: 4,
            display: "flex",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.background = `${cfg.color}18`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.6";
            e.currentTarget.style.background = "none";
          }}
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: cfg.color,
            opacity: 0.5,
            padding: 2,
            borderRadius: 4,
            display: "flex",
          }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>

      {/* Task list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 8px 4px" }}>
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onClick={() => onTaskClick(t)} />
        ))}

        {/* Add button */}
        <button
          type="button"
          onClick={onAddTask}
          style={{
            width: "100%",
            background: "none",
            border: `1px dashed ${cfg.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            color: "#9ca3af",
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 4,
            transition: "all 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = cfg.color;
            e.currentTarget.style.color = cfg.color;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = cfg.border;
            e.currentTarget.style.color = "#9ca3af";
          }}
        >
          <Plus size={11} /> Adicionar Tarefa
        </button>
      </div>
    </div>
  );
}

// ─── Kanban view ──────────────────────────────────────────────────────────────

function KanbanView({
  tasks,
  onAddTask,
  onTaskClick,
}: {
  tasks: ProjectTask[];
  onAddTask: (status: StatusKey) => void;
  onTaskClick: (t: ProjectTask) => void;
}) {
  const grouped = useMemo(() => {
    const m: Record<StatusKey, ProjectTask[]> = {
      previsto: [],
      planejado: [],
      em_andamento: [],
      paralisado: [],
      cancelado: [],
      aprovacao_copasa: [],
    };
    for (const t of tasks) m[normalizeStatus(t.status)].push(t);
    return m;
  }, [tasks]);

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        overflowY: "hidden",
        height: "100%",
        padding: "16px 20px",
        alignItems: "flex-start",
      }}
    >
      {STATUS_ORDER.map((key) => (
        <KanbanColumn
          key={key}
          statusKey={key}
          tasks={grouped[key]}
          onAddTask={() => onAddTask(key)}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({
  tasks,
  onTaskClick,
}: {
  tasks: ProjectTask[];
  onTaskClick: (t: ProjectTask) => void;
}) {
  const COLS = [
    { label: "OS", w: 80 },
    { label: "Tarefa / Município", w: "auto" },
    { label: "Tipo", w: 64 },
    { label: "Status", w: 172 },
    { label: "Prioridade", w: 88 },
    { label: "Prazo", w: 88 },
    { label: "Subtarefas", w: 88 },
  ];

  const sorted = [...tasks].sort((a, b) => {
    return (
      STATUS_ORDER.indexOf(normalizeStatus(a.status)) -
      STATUS_ORDER.indexOf(normalizeStatus(b.status))
    );
  });

  return (
    <div style={{ overflowY: "auto", height: "100%", padding: "0 20px 20px" }}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: "2px solid #e5e7eb",
          padding: "8px 0",
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 5,
        }}
      >
        {COLS.map((c) => (
          <div
            key={c.label}
            style={{
              width: c.w === "auto" ? "auto" : c.w,
              flex: c.w === "auto" ? 1 : "none",
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "0 8px",
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "60px 0",
            color: "#9ca3af",
          }}
        >
          <ListTodo
            size={40}
            style={{ margin: "0 auto 12px", opacity: 0.25 }}
          />
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            Nenhuma tarefa encontrada
          </p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            Selecione um projeto ou crie a primeira tarefa
          </p>
        </div>
      )}

      {sorted.map((task) => {
        const { osCode, systemType, municipality } = parseTaskTitle(task.title);
        const sk = normalizeStatus(task.status);
        const cfg = STATUSES[sk];
        const SIcon = cfg.Icon;
        const due = fmtDate(task.planned_due_date);
        const overdue = isOverdue(task);
        const tags = extractTags(task.description);
        const prio = PRIORITY_CONFIG[task.priority ?? "normal"];

        return (
          <div
            key={task.id}
            onClick={() => onTaskClick(task)}
            style={{
              display: "flex",
              alignItems: "center",
              borderBottom: "1px solid #f3f4f6",
              padding: "8px 0",
              cursor: "pointer",
              transition: "background 0.1s",
              minHeight: 44,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fafafa";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {/* OS Code */}
            <div
              style={{
                width: 80,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: "#9ca3af",
                padding: "0 8px",
                whiteSpace: "nowrap",
              }}
            >
              {osCode ?? "—"}
            </div>

            {/* Name */}
            <div style={{ flex: 1, padding: "0 8px", minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#111827",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {municipality || task.title}
              </div>
              {tags.length > 0 && (
                <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                  {tags.map((t) => (
                    <TagPill key={t} tag={t} />
                  ))}
                </div>
              )}
            </div>

            {/* Type */}
            <div style={{ width: 64, flexShrink: 0, padding: "0 8px" }}>
              {systemType ? (
                <Badge variant="neutral" style={{ fontSize: 9, padding: "1px 6px" }}>
                  {systemType}
                </Badge>
              ) : (
                <span style={{ color: "#e5e7eb", fontSize: 11 }}>—</span>
              )}
            </div>

            {/* Status */}
            <div style={{ width: 172, flexShrink: 0, padding: "0 8px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 8px",
                  borderRadius: 20,
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                }}
              >
                <SIcon size={10} style={{ color: cfg.color }} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: cfg.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {cfg.label}
                </span>
              </div>
            </div>

            {/* Priority */}
            <div style={{ width: 88, flexShrink: 0, padding: "0 8px" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: prio?.color ?? "#9ca3af",
                }}
              >
                {prio?.label ?? "—"}
              </span>
            </div>

            {/* Due */}
            <div style={{ width: 88, flexShrink: 0, padding: "0 8px" }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: overdue ? "#ef4444" : "#6b7280",
                }}
              >
                {due ?? "—"}
              </span>
            </div>

            {/* Subtasks */}
            <div style={{ width: 88, flexShrink: 0, padding: "0 8px" }}>
              <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gantt view ───────────────────────────────────────────────────────────────

function GanttView({ tasks }: { tasks: ProjectTask[] }) {
  const today = new Date();
  const tasksWithDates = tasks.filter((t) => t.planned_due_date);

  const allDates = tasksWithDates
    .map((t) => new Date(t.planned_due_date!))
    .filter((d) => !isNaN(d.getTime()));

  const minD = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth(), 1);
  const maxD = allDates.length
    ? new Date(Math.max(...allDates.map((d) => d.getTime())))
    : new Date(today.getFullYear(), today.getMonth() + 2, 0);

  minD.setDate(minD.getDate() - 14);
  maxD.setDate(maxD.getDate() + 21);

  const totalDays = Math.max(
    1,
    Math.ceil((maxD.getTime() - minD.getTime()) / 86400000)
  );
  const DAY_W = 28;
  const ROW_H = 46;
  const LEFT = 260;

  const todayOff = Math.floor(
    (today.getTime() - minD.getTime()) / 86400000
  );

  // Build month headers
  const months: { label: string; days: number }[] = [];
  let cur = new Date(minD.getFullYear(), minD.getMonth(), 1);
  while (cur <= maxD) {
    const end = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const clampedStart = cur < minD ? minD : cur;
    const clampedEnd = end > maxD ? maxD : end;
    const days =
      Math.ceil(
        (clampedEnd.getTime() - clampedStart.getTime()) / 86400000
      ) + 1;
    months.push({
      label: cur.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
      days,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  return (
    <div
      style={{ overflowX: "auto", overflowY: "auto", height: "100%", padding: 20 }}
    >
      <div style={{ minWidth: LEFT + totalDays * DAY_W, position: "relative" }}>
        {/* Month header */}
        <div
          style={{
            display: "flex",
            marginLeft: LEFT,
            borderBottom: "1px solid #e5e7eb",
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 4,
          }}
        >
          {months.map((m, i) => (
            <div
              key={i}
              style={{
                width: m.days * DAY_W,
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                color: "#374151",
                padding: "6px 8px",
                borderRight: "1px solid #f3f4f6",
                background: "#fafafa",
                textTransform: "capitalize",
              }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Today line */}
        {todayOff >= 0 && todayOff <= totalDays && (
          <div
            style={{
              position: "absolute",
              left: LEFT + todayOff * DAY_W,
              top: 32,
              bottom: 0,
              width: 2,
              background: "#ef4444",
              opacity: 0.4,
              zIndex: 3,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Rows */}
        {tasksWithDates.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "60px 0",
              color: "#9ca3af",
              marginLeft: LEFT,
            }}
          >
            <BarChart2
              size={40}
              style={{ margin: "0 auto 12px", opacity: 0.25 }}
            />
            <p style={{ fontSize: 14, fontWeight: 600 }}>
              Nenhuma tarefa com prazo definido
            </p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Adicione prazos às tarefas para visualizá-las no Gantt.
            </p>
          </div>
        )}

        {tasks.map((task) => {
          const { osCode, systemType, municipality } = parseTaskTitle(
            task.title
          );
          const endDate = task.planned_due_date
            ? new Date(task.planned_due_date)
            : null;
          if (!endDate) return null;

          const startDate = new Date(task.created_at);
          const startOff = Math.max(
            0,
            Math.floor((startDate.getTime() - minD.getTime()) / 86400000)
          );
          const endOff = Math.floor(
            (endDate.getTime() - minD.getTime()) / 86400000
          );
          const barW = Math.max(DAY_W, (endOff - startOff) * DAY_W);
          const sk = normalizeStatus(task.status);
          const cfg = STATUSES[sk];

          return (
            <div
              key={task.id}
              style={{
                display: "flex",
                alignItems: "center",
                height: ROW_H,
                borderBottom: "1px solid #f3f4f6",
              }}
            >
              {/* Left label */}
              <div
                style={{
                  width: LEFT,
                  flexShrink: 0,
                  padding: "0 12px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  borderRight: "1px solid #e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <cfg.Icon
                  size={12}
                  style={{ color: cfg.color, flexShrink: 0 }}
                />
                <div style={{ minWidth: 0 }}>
                  {osCode && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#9ca3af",
                        marginRight: 4,
                        fontWeight: 700,
                      }}
                    >
                      {osCode}
                    </span>
                  )}
                  {systemType && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6366f1",
                        marginRight: 3,
                        fontWeight: 600,
                      }}
                    >
                      {systemType}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>
                    {municipality || task.title}
                  </span>
                </div>
              </div>

              {/* Timeline row */}
              <div
                style={{
                  position: "relative",
                  flex: 1,
                  height: "100%",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: startOff * DAY_W,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: barW,
                    height: 26,
                    background: cfg.color,
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                    overflow: "hidden",
                    opacity: 0.85,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      overflow: "hidden",
                    }}
                  >
                    {municipality || task.title}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task detail panel ────────────────────────────────────────────────────────

function TaskDetailPanel({
  task,
  onClose,
  onStatusChange,
  onDelete,
  podeEditar,
}: {
  task: ProjectTask;
  onClose: () => void;
  onStatusChange: (id: string, status: StatusKey) => void;
  onDelete: (id: string) => void;
  podeEditar: boolean;
}) {
  const { osCode, systemType, municipality } = parseTaskTitle(task.title);
  const sk = normalizeStatus(task.status);
  const cfg = STATUSES[sk];
  const SIcon = cfg.Icon;
  const tags = extractTags(task.description);
  const due = fmtDate(task.planned_due_date);
  const overdue = isOverdue(task);

  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid #f3f4f6",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fafafa",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 10px",
            borderRadius: 20,
            background: cfg.bg,
            border: `1px solid ${cfg.border}`,
          }}
        >
          <SIcon size={11} style={{ color: cfg.color }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: cfg.color,
              textTransform: "uppercase",
            }}
          >
            {cfg.label}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {podeEditar && (
            <button
              type="button"
              onClick={() => onDelete(task.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9ca3af",
                padding: 4,
                borderRadius: 5,
                display: "flex",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#ef4444";
                e.currentTarget.style.background = "#fef2f2";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9ca3af";
                e.currentTarget.style.background = "none";
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="3,6 5,6 21,6" />
                <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              padding: 4,
              borderRadius: 5,
              display: "flex",
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ overflowY: "auto", flex: 1, padding: 16 }}>
        {osCode && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              marginBottom: 4,
            }}
          >
            {osCode}
          </div>
        )}
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "#111827",
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          {systemType && (
            <span style={{ color: "#6366f1" }}>{systemType} - </span>
          )}
          {municipality || task.title}
        </h2>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 16 }}>
            {tags.map((t) => (
              <TagPill key={t} tag={t} />
            ))}
          </div>
        )}

        {/* Info grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 16px",
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              Prazo
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: overdue ? "#ef4444" : "#374151",
              }}
            >
              {due ?? "Não definido"}
              {overdue && (
                <span
                  style={{
                    fontSize: 10,
                    marginLeft: 4,
                    color: "#ef4444",
                  }}
                >
                  · Atrasado
                </span>
              )}
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 4,
              }}
            >
              Prioridade
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  PRIORITY_CONFIG[task.priority ?? "normal"]?.color ??
                  "#9ca3af",
              }}
            >
              {PRIORITY_CONFIG[task.priority ?? "normal"]?.label ?? "—"}
            </div>
          </div>
        </div>

        {/* Change status */}
        {podeEditar && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 8,
              }}
            >
              Mover para
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {STATUS_ORDER.filter((s) => s !== sk).map((s) => {
                const c = STATUSES[s];
                const I = c.Icon;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusChange(task.id, s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      cursor: "pointer",
                      fontSize: 10,
                      fontWeight: 700,
                      color: c.color,
                      transition: "opacity 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = "0.75";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    <I size={10} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              Descrição
            </div>
            <p
              style={{
                fontSize: 12,
                color: "#374151",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {task.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add task modal ───────────────────────────────────────────────────────────

function AddTaskModal({
  defaultStatus,
  projectId,
  onClose,
  onCreated,
}: {
  defaultStatus: StatusKey;
  projectId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<StatusKey>(defaultStatus);
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!title.trim()) return;
    setLoading(true);
    const { error } = await supabase.from("tasks").insert({
      title: title.trim(),
      status,
      priority,
      planned_due_date: dueDate || null,
      description: description || null,
      project_id: projectId,
    });
    if (error) {
      showErrorToast("Não foi possível criar", getSupabaseErrorMessage(error));
      setLoading(false);
      return;
    }
    showSuccessToast("Tarefa criada");
    onCreated();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fafafa",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
            Nova Tarefa
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Título — padrão: OS X.XX - SISTEMA - MUNICÍPIO">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) void handleCreate();
              }}
              placeholder="OS 4.07 - SES - ALÉM PARAÍBA"
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Status">
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusKey)}
              >
                {STATUS_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {STATUSES[k].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridade">
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Prazo">
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>

          <Field label="Descrição (use #tag para adicionar etiquetas)">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Detalhes da OS... Use #projeto básico, #orçamento, etc."
            />
          </Field>
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #f3f4f6",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            background: "#fafafa",
          }}
        >
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleCreate()}
            loading={loading}
            disabled={!title.trim() || loading}
          >
            Criar Tarefa
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [spaces, setSpaces] = useState<WorkspaceSpace[]>([]);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedSpaces, setExpandedSpaces] = useState<Record<string, boolean>>({});
  const [activeView, setActiveView] = useState<"kanban" | "list" | "gantt">("kanban");
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null);
  const [addModal, setAddModal] = useState<{ status: StatusKey } | null>(null);

  const podeEditar = canEditWorkspaceNodes(myRole);

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadSpacesNodes = useCallback(async () => {
    const [spRes, noRes] = await Promise.all([
      supabase
        .from("workspace_spaces")
        .select("id, name, icon, color, sort_order")
        .order("sort_order")
        .order("name"),
      supabase
        .from("workspace_space_nodes")
        .select("id, space_id, parent_id, kind, name, color, sort_order, project_id")
        .order("sort_order")
        .order("name"),
    ]);
    if (spRes.data) setSpaces(spRes.data as WorkspaceSpace[]);
    if (noRes.data) setNodes(noRes.data as WorkspaceNode[]);
    setLoading(false);
  }, []);

  const loadTasks = useCallback(
    async (projectIds: string[]) => {
      if (projectIds.length === 0) {
        setTasks([]);
        setLoadingTasks(false);
        return;
      }
      setLoadingTasks(true);
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, priority, planned_due_date, project_id, assigned_to, description, created_at"
        )
        .in("project_id", projectIds)
        .order("created_at", { ascending: true });

      if (error) logSupabaseUnlessJwt("[kanban] tasks", error);
      setTasks((data ?? []) as ProjectTask[]);
      setLoadingTasks(false);
    },
    []
  );

  useEffect(() => {
    getCurrentProfile().then((p) => setMyRole(p?.role ?? null));
    void loadSpacesNodes();
  }, [loadSpacesNodes]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedSpace = useMemo(
    () => spaces.find((s) => s.id === selectedSpaceId) ?? null,
    [spaces, selectedSpaceId]
  );

  // Collect project IDs to fetch tasks for
  useEffect(() => {
    if (!selectedNodeId) {
      setTasks([]);
      return;
    }
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return;

    const projectIds: string[] = [];
    if (node.kind === "list" && node.project_id) {
      projectIds.push(node.project_id);
    } else if (node.kind === "folder") {
      // Collect all descendant list project_ids
      const collect = (parentId: string) => {
        nodes
          .filter((n) => n.parent_id === parentId)
          .forEach((child) => {
            if (child.kind === "list" && child.project_id)
              projectIds.push(child.project_id);
            else if (child.kind === "folder") collect(child.id);
          });
      };
      collect(node.id);
    }
    void loadTasks(projectIds);
  }, [selectedNodeId, nodes, loadTasks]);

  // ─── Sidebar helpers ──────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedSpaces((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  }

  function selectNode(node: WorkspaceNode) {
    setSelectedSpaceId(node.space_id);
    setSelectedNodeId(node.id);
    setSelectedTask(null);
  }

  // Count nodes within a folder/space
  function countDescendantLists(parentId: string): number {
    let count = 0;
    nodes
      .filter((n) => n.parent_id === parentId)
      .forEach((child) => {
        if (child.kind === "list") count += 1;
        else if (child.kind === "folder") count += countDescendantLists(child.id);
      });
    return count;
  }

  function renderNodes(parentId: string | null, spaceId: string, depth: number): React.ReactNode {
    const children = nodes
      .filter((n) => n.space_id === spaceId && n.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order);

    return children.map((node) => {
      const isSelected = selectedNodeId === node.id;
      const isFolder = node.kind === "folder";
      const hasChildren = nodes.some((n) => n.parent_id === node.id);
      const isExpanded = expandedSpaces[node.id] ?? true;
      const nodeColor = node.color ?? (isFolder ? "#f59e0b" : "#6366f1");

      return (
        <div key={node.id}>
          <div
            onClick={() => {
              if (isFolder && hasChildren) toggleExpand(node.id);
              selectNode(node);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: `5px 8px 5px ${8 + depth * 14}px`,
              cursor: "pointer",
              borderRadius: 6,
              margin: "1px 4px",
              background: isSelected ? "rgba(99,102,241,0.1)" : "transparent",
              border: `1px solid ${isSelected ? "rgba(99,102,241,0.25)" : "transparent"}`,
              transition: "all 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isSelected)
                e.currentTarget.style.background = "rgba(0,0,0,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = "transparent";
            }}
          >
            {isFolder && hasChildren ? (
              isExpanded ? (
                <ChevronDown
                  size={10}
                  style={{ color: "#9ca3af", flexShrink: 0 }}
                />
              ) : (
                <ChevronRight
                  size={10}
                  style={{ color: "#9ca3af", flexShrink: 0 }}
                />
              )
            ) : (
              <span style={{ width: 10, flexShrink: 0 }} />
            )}
            {isFolder ? (
              <Folder
                size={12}
                style={{ color: nodeColor, flexShrink: 0 }}
              />
            ) : (
              <ListTodo
                size={12}
                style={{ color: nodeColor, flexShrink: 0 }}
              />
            )}
            <span
              style={{
                fontSize: 12,
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? "#111827" : "#4b5563",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {node.name}
            </span>
            {/* Task / list count badge */}
            {isFolder && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#9ca3af",
                  background: "#f3f4f6",
                  borderRadius: 10,
                  padding: "1px 5px",
                  flexShrink: 0,
                }}
              >
                {countDescendantLists(node.id)}
              </span>
            )}
          </div>
          {isFolder && isExpanded && renderNodes(node.id, spaceId, depth + 1)}
        </div>
      );
    });
  }

  // ─── Task actions ─────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, status: StatusKey) {
    const { error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", id);
    if (error) {
      showErrorToast("Erro ao atualizar", getSupabaseErrorMessage(error));
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    if (selectedTask?.id === id) setSelectedTask((t) => t && { ...t, status });
    showSuccessToast("Status atualizado");
  }

  async function handleDeleteTask(id: string) {
    if (!window.confirm("Excluir esta tarefa permanentemente?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      showErrorToast("Erro ao excluir", getSupabaseErrorMessage(error));
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTask?.id === id) setSelectedTask(null);
    showSuccessToast("Tarefa excluída");
  }

  // ─── Filtered tasks ───────────────────────────────────────────────────────

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return tasks;
    const s = search.toLowerCase();
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(s) ||
        (t.description ?? "").toLowerCase().includes(s)
    );
  }, [tasks, search]);

  // ─── Breadcrumb ───────────────────────────────────────────────────────────

  const breadcrumb: string[] = [];
  if (selectedSpace) breadcrumb.push(selectedSpace.name);
  if (selectedNode) breadcrumb.push(selectedNode.name);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 120px)",
        background: "#f9fafb",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* ── LEFT SIDEBAR ── */}
      <div
        style={{
          width: 220,
          flexShrink: 0,
          background: "#fff",
          borderRight: "1px solid #e5e7eb",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Brand / header */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: "1px solid #f3f4f6",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "linear-gradient(135deg,#6366f1,#818cf8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Layers size={14} style={{ color: "#fff" }} />
            </div>
            <div>
              <div
                style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}
              >
                Gestão de OS
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>
                Projetos &amp; Serviços
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div
          style={{ overflowY: "auto", flex: 1, padding: "6px 0 12px" }}
        >
          {/* All tasks */}
          <div
            onClick={() => {
              setSelectedSpaceId(null);
              setSelectedNodeId(null);
              setSelectedTask(null);
              setTasks([]);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: !selectedNodeId ? 600 : 500,
              color: !selectedNodeId ? "#6366f1" : "#4b5563",
              background: !selectedNodeId
                ? "rgba(99,102,241,0.08)"
                : "transparent",
              borderRadius: 6,
              margin: "1px 4px",
              transition: "all 0.1s",
            }}
          >
            <LayoutGrid size={13} style={{ flexShrink: 0 }} />
            Todas as tarefas
          </div>

          {/* Spaces */}
          {loading && (
            <p
              style={{
                fontSize: 11,
                color: "#9ca3af",
                padding: "8px 14px",
              }}
            >
              Carregando…
            </p>
          )}
          {spaces.map((space) => {
            const isExpanded = expandedSpaces[space.id] ?? true;
            const isSpaceActive =
              selectedSpaceId === space.id && !selectedNodeId;
            const spaceNodes = nodes.filter(
              (n) => n.space_id === space.id && n.parent_id === null
            );

            return (
              <div key={space.id}>
                <div
                  onClick={() => {
                    setSelectedSpaceId(space.id);
                    setSelectedNodeId(null);
                    setSelectedTask(null);
                    toggleExpand(space.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 14px",
                    cursor: "pointer",
                    borderRadius: 6,
                    margin: "1px 4px",
                    background: isSpaceActive
                      ? "rgba(99,102,241,0.06)"
                      : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSpaceActive)
                      e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSpaceActive)
                      e.currentTarget.style.background = "transparent";
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown
                      size={10}
                      style={{ color: "#9ca3af", flexShrink: 0 }}
                    />
                  ) : (
                    <ChevronRight
                      size={10}
                      style={{ color: "#9ca3af", flexShrink: 0 }}
                    />
                  )}
                  <SpaceGlyph
                    icon={space.icon}
                    color={space.color}
                    size={13}
                  />
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#1f2937",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                    }}
                  >
                    {space.name}
                  </span>
                  {spaceNodes.length > 0 && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#9ca3af",
                        background: "#f3f4f6",
                        borderRadius: 10,
                        padding: "1px 5px",
                        flexShrink: 0,
                      }}
                    >
                      {spaceNodes.length}
                    </span>
                  )}
                </div>

                {isExpanded && renderNodes(null, space.id, 0)}
              </div>
            );
          })}

          {/* New space hint */}
          {!loading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 14px",
                cursor: "pointer",
                fontSize: 11,
                color: "#9ca3af",
                marginTop: 6,
                borderRadius: 6,
                margin: "6px 4px 0",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#6366f1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9ca3af";
              }}
            >
              <Plus size={11} style={{ flexShrink: 0 }} />
              Novo Espaço
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN PANEL ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        {/* Top header */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            flexShrink: 0,
          }}
        >
          {/* Breadcrumb + actions row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 20px",
              height: 50,
              gap: 12,
            }}
          >
            {/* Breadcrumb */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                minWidth: 0,
                flex: 1,
              }}
            >
              {breadcrumb.length === 0 && (
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#111827",
                  }}
                >
                  Todas as tarefas
                </span>
              )}
              {breadcrumb.map((crumb, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  {i > 0 && (
                    <ChevronRight
                      size={13}
                      style={{ color: "#d1d5db", flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: i === breadcrumb.length - 1 ? 700 : 600,
                      color:
                        i === breadcrumb.length - 1 ? "#111827" : "#6b7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {crumb}
                  </span>
                </div>
              ))}
              {selectedNode && (
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#d1d5db",
                    padding: 2,
                    display: "flex",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#fbbf24";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#d1d5db";
                  }}
                >
                  <Star size={13} />
                </button>
              )}
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#374151",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                }}
              >
                <Bot size={12} /> Agentes
              </button>
              <button
                type="button"
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#374151",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                }}
              >
                <Sparkles size={12} /> Pergunte à IA
              </button>
              <button
                type="button"
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  padding: "5px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#374151",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  whiteSpace: "nowrap",
                }}
              >
                <Share2 size={12} /> Compartilhar
              </button>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() =>
                    setAddModal({ status: "em_andamento" })
                  }
                  style={{
                    background: "#6366f1",
                    border: "none",
                    borderRadius: 6,
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#4f46e5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#6366f1";
                  }}
                >
                  <Plus size={12} /> Add Tarefa
                </button>
              )}
            </div>
          </div>

          {/* View tabs */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderTop: "1px solid #f3f4f6",
              padding: "0 20px",
            }}
          >
            {(
              [
                { key: "kanban", label: "Quadro", Icon: LayoutGrid },
                { key: "list", label: "Lista", Icon: List },
                { key: "gantt", label: "Gantt", Icon: BarChart2 },
              ] as const
            ).map(({ key, label, Icon }) => {
              const isActive = activeView === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveView(key)}
                  style={{
                    background: "none",
                    border: "none",
                    borderBottom: isActive
                      ? "2px solid #6366f1"
                      : "2px solid transparent",
                    padding: "8px 14px",
                    fontSize: 12,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#6366f1" : "#6b7280",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    whiteSpace: "nowrap",
                    transition: "all 0.1s",
                  }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 12px",
                fontSize: 11,
                color: "#9ca3af",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Plus size={11} /> Visualização
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #e5e7eb",
            padding: "5px 20px",
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <FilterChip label="Grupo: Status" active />
          <FilterChip label="Subtarefas" />
          <div
            style={{ width: 1, height: 16, background: "#e5e7eb", margin: "0 4px" }}
          />
          <FilterChip
            label="Classificar"
            icon={<ArrowDown size={10} />}
          />
          <FilterChip
            label="Filtro"
            icon={<Filter size={10} />}
          />
          <FilterChip label="Fechado" />
          <FilterChip
            label="Responsável"
            icon={<Users size={10} />}
          />
          <div style={{ flex: 1 }} />
          {/* Search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 10px",
            }}
          >
            <Search size={11} style={{ color: "#9ca3af", flexShrink: 0 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar…"
              style={{
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 11,
                color: "#374151",
                width: 130,
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  padding: 0,
                  display: "flex",
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
          <FilterChip
            label="Personalizar"
            icon={<Settings size={10} />}
          />
        </div>

        {/* Content + optional detail panel */}
        <div
          style={{
            flex: 1,
            display: "flex",
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          {/* Main view */}
          <div style={{ flex: 1, overflow: "hidden", minWidth: 0 }}>
            {!selectedNodeId ? (
              /* Empty state */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  gap: 12,
                  color: "#9ca3af",
                }}
              >
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    background: "linear-gradient(135deg,rgba(99,102,241,0.1),rgba(129,140,248,0.1))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 4,
                  }}
                >
                  <Layers size={32} style={{ color: "#a5b4fc" }} />
                </div>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#374151",
                  }}
                >
                  Selecione um projeto
                </p>
                <p style={{ fontSize: 12, maxWidth: 300, textAlign: "center" }}>
                  Escolha um lote ou lista na barra lateral para visualizar e
                  gerenciar as Ordens de Serviço.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  {STATUS_ORDER.slice(0, 3).map((sk) => {
                    const c = STATUSES[sk];
                    return (
                      <div
                        key={sk}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          background: c.bg,
                          border: `1px solid ${c.border}`,
                          fontSize: 10,
                          fontWeight: 700,
                          color: c.color,
                        }}
                      >
                        {c.label}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : loadingTasks ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  flexDirection: "column",
                  gap: 10,
                  color: "#9ca3af",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: "3px solid #e5e7eb",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <p style={{ fontSize: 12 }}>Carregando tarefas…</p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : (
              <>
                {activeView === "kanban" && (
                  <KanbanView
                    tasks={filteredTasks}
                    onAddTask={(status) => setAddModal({ status })}
                    onTaskClick={setSelectedTask}
                  />
                )}
                {activeView === "list" && (
                  <ListView
                    tasks={filteredTasks}
                    onTaskClick={setSelectedTask}
                  />
                )}
                {activeView === "gantt" && (
                  <GanttView tasks={filteredTasks} />
                )}
              </>
            )}
          </div>

          {/* Task detail side panel */}
          {selectedTask && (
            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedTask(null)}
              onStatusChange={handleStatusChange}
              onDelete={handleDeleteTask}
              podeEditar={podeEditar}
            />
          )}
        </div>
      </div>

      {/* Add task modal */}
      {addModal && (
        <AddTaskModal
          defaultStatus={addModal.status}
          projectId={selectedNode?.project_id ?? null}
          onClose={() => setAddModal(null)}
          onCreated={() => {
            setAddModal(null);
            if (selectedNode?.project_id) {
              void loadTasks([selectedNode.project_id]);
            }
          }}
        />
      )}
    </div>
  );
}
