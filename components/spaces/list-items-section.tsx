"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  LayoutList,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Briefcase,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage, logSupabaseUnlessJwt } from "@/lib/supabase/errors";
import type { KanbanColumnDef, CustomFieldDef, WorkspaceViewMode } from "@/lib/workspaces/spaces-shared";
import { parseKanbanColumns, DEFAULT_KANBAN_COLUMNS } from "@/lib/workspaces/spaces-shared";
import { showErrorToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";

export type WorkspaceListItemRow = {
  id: string;
  list_node_id: string;
  title: string;
  status_key: string;
  sort_order: number;
  custom_values: Record<string, string | number | null>;
  created_at: string;
};

type ProjectTask = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  planned_due_date: string | null;
  assigned_to: string | null;
  description: string | null;
};

type Props = {
  listNodeId: string;
  projectId?: string | null;
  enabled: boolean;
  defaultView: WorkspaceViewMode;
  userViewMode: WorkspaceViewMode | null;
  onUserViewModeChange: (mode: WorkspaceViewMode) => void;
  kanbanColumnsRaw: unknown;
  customFieldDefs: CustomFieldDef[];
  podeEditarItens: boolean;
};

// ─── Task status / priority configs ─────────────────────────────────────────

const TASK_STATUS_ORDER = ["pending", "in_progress", "completed", "cancelled"];

const TASK_STATUS_CONFIG: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  pending:     { label: "A fazer",      color: "#64748b", Icon: Clock },
  in_progress: { label: "Em andamento", color: "#f59e0b", Icon: AlertCircle },
  completed:   { label: "Concluído",    color: "#22c55e", Icon: CheckCircle2 },
  cancelled:   { label: "Cancelado",    color: "#ef4444", Icon: XCircle },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low:      { label: "Baixa",   color: "#64748b" },
  medium:   { label: "Média",   color: "#3b82f6" },
  high:     { label: "Alta",    color: "#f59e0b" },
  critical: { label: "Crítica", color: "#ef4444" },
};

const TASK_GRID = "36px 1fr 80px 110px 36px";

// ─── Cores automáticas por status ───────────────────────────────────────────

const STATUS_COLORS_BY_INDEX = [
  "#64748b", // slate
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#22c55e", // green
  "#ef4444", // red
  "#6366f1", // indigo
  "#c026d3", // purple
  "#0d9488", // teal
];

function getColColor(col: KanbanColumnDef, index: number): string {
  const key = col.key.toLowerCase();
  const label = col.label.toLowerCase();
  if (/conclu|feito|done|complet/.test(key + label)) return "#22c55e";
  if (/andamento|doing|progress|em prog/.test(key + label)) return "#f59e0b";
  if (/paral|block|bloq|suspend|parado/.test(key + label)) return "#ef4444";
  if (/aprov|review|revis|revisão|pending/.test(key + label)) return "#3b82f6";
  if (/todo|fazer|a faz|iniciar/.test(key + label)) return "#64748b";
  return STATUS_COLORS_BY_INDEX[index % STATUS_COLORS_BY_INDEX.length];
}

function parseCustomValues(raw: unknown): Record<string, string | number | null> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string | number | null> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === "number") out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

function formatFieldValue(val: string | number | null, type: CustomFieldDef["type"]): string {
  if (val === null || val === undefined || val === "") return "—";
  if (type === "number") {
    const n = Number(val);
    if (isNaN(n)) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  if (type === "date") return String(val).slice(0, 10);
  return String(val);
}

// ─── Linha de tarefa do projeto (read-only) ──────────────────────────────────

function ProjectTaskRow({
  task,
  podeEditar,
  onDelete,
}: {
  task: ProjectTask;
  podeEditar: boolean;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const status = TASK_STATUS_CONFIG[task.status] ?? { label: task.status, color: "#64748b" };
  const priority = task.priority ? PRIORITY_CONFIG[task.priority] : null;
  const isOverdue =
    task.planned_due_date &&
    task.status !== "completed" &&
    task.status !== "cancelled" &&
    new Date(task.planned_due_date) < new Date();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: TASK_GRID,
        alignItems: "center",
        minHeight: 36,
        borderBottom: "1px solid var(--border)",
        transition: "background 0.1s",
        background: hovered ? "var(--surface-2)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Status dot */}
      <div className="flex items-center justify-center">
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: task.status === "completed" ? status.color : "transparent",
            border: `2px solid ${status.color}`,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Title */}
      <div
        style={{
          padding: "4px 8px 4px 0",
          fontSize: 13,
          fontWeight: 500,
          color: task.status === "completed" ? "var(--muted-fg)" : "var(--foreground)",
          textDecoration: task.status === "completed" ? "line-through" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={task.title}
      >
        {task.title}
        {task.description && (
          <span style={{ fontSize: 11, color: "var(--muted-fg)", marginLeft: 6, fontWeight: 400 }}>
            {task.description.slice(0, 60)}{task.description.length > 60 ? "…" : ""}
          </span>
        )}
      </div>

      {/* Priority */}
      <div style={{ padding: "4px 8px", display: "flex", alignItems: "center" }}>
        {priority && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: priority.color,
              background: `color-mix(in srgb, ${priority.color} 14%, transparent)`,
              borderRadius: 4,
              padding: "2px 6px",
              whiteSpace: "nowrap",
            }}
          >
            {priority.label}
          </span>
        )}
      </div>

      {/* Due date */}
      <div
        style={{
          padding: "4px 8px",
          fontSize: 11,
          fontWeight: isOverdue ? 700 : 400,
          color: isOverdue ? "#ef4444" : "var(--muted-fg)",
          whiteSpace: "nowrap",
        }}
      >
        {task.planned_due_date ? task.planned_due_date.slice(0, 10) : "—"}
        {isOverdue && (
          <span style={{ marginLeft: 4, fontSize: 9, background: "#ef4444", color: "#fff", borderRadius: 3, padding: "1px 4px", fontWeight: 700 }}>
            ATRASADO
          </span>
        )}
      </div>

      {/* Delete */}
      <div className="flex items-center justify-center">
        {podeEditar && (
          <button
            type="button"
            title="Excluir tarefa"
            onClick={() => onDelete(task.id)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--muted-fg)",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 4,
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ProjectTaskGroup({
  statusKey,
  tasks,
  podeEditar,
  onDelete,
}: {
  statusKey: string;
  tasks: ProjectTask[];
  podeEditar: boolean;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const cfg = TASK_STATUS_CONFIG[statusKey] ?? { label: statusKey, color: "#64748b", Icon: Clock };

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: TASK_GRID,
          alignItems: "center",
          minHeight: 34,
          background: `color-mix(in srgb, ${cfg.color} 6%, var(--surface-2))`,
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-center">
          {open ? <ChevronDown size={13} style={{ color: cfg.color }} /> : <ChevronRight size={13} style={{ color: cfg.color }} />}
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.color, flexShrink: 0, boxShadow: `0 0 0 2px color-mix(in srgb, ${cfg.color} 25%, transparent)` }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-fg)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "0 6px", minWidth: 20, textAlign: "center" }}>
            {tasks.length}
          </span>
        </div>
        <div style={{ padding: "0 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted-fg)", letterSpacing: "0.05em" }}>Prioridade</div>
        <div style={{ padding: "0 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--muted-fg)", letterSpacing: "0.05em" }}>Prazo</div>
        <div />
      </div>
      {open && tasks.map((t) => (
        <ProjectTaskRow key={t.id} task={t} podeEditar={podeEditar} onDelete={onDelete} />
      ))}
    </div>
  );
}

function ProjectTasksSection({
  tasks,
  projectId,
  podeEditar,
  onDelete,
}: {
  tasks: ProjectTask[];
  projectId: string;
  podeEditar: boolean;
  onDelete: (id: string) => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    for (const t of tasks) {
      if (!map[t.status]) map[t.status] = [];
      map[t.status].push(t);
    }
    // Order by TASK_STATUS_ORDER, then any unknown statuses
    const known = TASK_STATUS_ORDER.filter((k) => map[k]?.length);
    const unknown = Object.keys(map).filter((k) => !TASK_STATUS_ORDER.includes(k));
    return [...known, ...unknown];
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2)",
        }}
      >
        <Briefcase size={14} style={{ color: "var(--muted-fg)" }} />
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Nenhuma tarefa cadastrada neste projeto ainda.
        </span>
        <Link href={`/tasks?project=${projectId}`} style={{ marginLeft: "auto" }}>
          <Button size="sm" variant="ghost" leftIcon={<ExternalLink size={12} />} style={{ fontSize: 11 }}>
            Ver tarefas
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px 6px 8px",
          background: "color-mix(in srgb, var(--primary) 6%, var(--surface-2))",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Briefcase size={13} style={{ color: "var(--primary)" }} />
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--primary)" }}>
            Tarefas do projeto
          </span>
          <span style={{ fontSize: 11, color: "var(--muted-fg)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "0 6px" }}>
            {tasks.length}
          </span>
        </div>
        <Link href={`/tasks`}>
          <Button size="sm" variant="ghost" leftIcon={<ExternalLink size={11} />} style={{ fontSize: 11 }}>
            Gerenciar tarefas
          </Button>
        </Link>
      </div>

      {/* Column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: TASK_GRID,
          alignItems: "center",
          minHeight: 30,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 33,
          zIndex: 1,
        }}
      >
        <div />
        <div style={{ padding: "4px 8px 4px 0", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-fg)" }}>
          Nome
        </div>
        <div style={{ padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-fg)" }}>
          Prioridade
        </div>
        <div style={{ padding: "4px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-fg)" }}>
          Prazo
        </div>
        <div />
      </div>

      {/* Groups */}
      {grouped.map((statusKey) => (
        <ProjectTaskGroup
          key={statusKey}
          statusKey={statusKey}
          tasks={tasks.filter((t) => t.status === statusKey)}
          podeEditar={podeEditar}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ─── Componente de linha de item (list view) ────────────────────────────────

function ItemRow({
  item,
  cols,
  customFieldDefs,
  podeEditarItens,
  colColor,
  setItems,
  patchItem,
  removeItem,
}: {
  item: WorkspaceListItemRow;
  cols: KanbanColumnDef[];
  customFieldDefs: CustomFieldDef[];
  podeEditarItens: boolean;
  colColor: string;
  setItems: Dispatch<SetStateAction<WorkspaceListItemRow[]>>;
  patchItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.title);

  function commitTitle() {
    setEditing(false);
    const t = titleDraft.trim();
    if (t && t !== item.title) void patchItem(item.id, { title: t });
    else setTitleDraft(item.title);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `36px 1fr ${customFieldDefs.map(() => "160px").join(" ")} 36px`,
        alignItems: "center",
        minHeight: 38,
        borderBottom: "1px solid var(--border)",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {/* Status dot */}
      <div className="flex items-center justify-center">
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `2px solid ${colColor}`,
            background: "transparent",
            flexShrink: 0,
          }}
        />
      </div>

      {/* Title */}
      <div style={{ padding: "4px 8px 4px 0", minWidth: 0 }}>
        {editing && podeEditarItens ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") { setEditing(false); setTitleDraft(item.title); }
            }}
            style={{
              background: "transparent",
              border: "none",
              outline: "1px solid var(--primary)",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--foreground)",
              width: "100%",
            }}
          />
        ) : (
          <span
            onClick={() => podeEditarItens && setEditing(true)}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--foreground)",
              cursor: podeEditarItens ? "text" : "default",
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={item.title}
          >
            {item.title}
          </span>
        )}
      </div>

      {/* Custom fields */}
      {customFieldDefs.map((f) => {
        const val = item.custom_values[f.id] ?? null;
        return (
          <div
            key={f.id}
            style={{
              padding: "4px 8px",
              fontSize: 13,
              color: val !== null && val !== "" ? "var(--foreground)" : "var(--muted-fg)",
              fontWeight: val !== null && val !== "" ? 500 : 400,
              borderLeft: "1px solid var(--border)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {podeEditarItens ? (
              f.type === "select" ? (
                <Select
                  value={String(val ?? "")}
                  onChange={(e) => {
                    const next = { ...item.custom_values, [f.id]: e.target.value || null };
                    void patchItem(item.id, { custom_values: next });
                  }}
                  style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", width: "100%" }}
                >
                  <option value="">—</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : f.type === "number" ? (
                <input
                  type="number"
                  defaultValue={val === null ? "" : String(val)}
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    const next = { ...item.custom_values, [f.id]: v };
                    void patchItem(item.id, { custom_values: next });
                  }}
                  style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", width: "100%", textAlign: "right" }}
                />
              ) : f.type === "date" ? (
                <input
                  type="date"
                  defaultValue={String(val ?? "").slice(0, 10)}
                  onChange={(e) => {
                    const next = { ...item.custom_values, [f.id]: e.target.value || null };
                    void patchItem(item.id, { custom_values: next });
                  }}
                  style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", width: "100%" }}
                />
              ) : (
                <input
                  type="text"
                  defaultValue={String(val ?? "")}
                  onBlur={(e) => {
                    const next = { ...item.custom_values, [f.id]: e.target.value || null };
                    void patchItem(item.id, { custom_values: next });
                  }}
                  style={{ fontSize: 12, padding: "2px 4px", border: "none", background: "transparent", width: "100%" }}
                />
              )
            ) : (
              formatFieldValue(val, f.type)
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex items-center justify-center">
        {podeEditarItens && (
          <button
            type="button"
            onClick={() => void removeItem(item.id)}
            title="Excluir item"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--muted-fg)",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 4,
              opacity: 0.25,
              transition: "opacity 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.opacity = "0.25"; }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Grupo de status ─────────────────────────────────────────────────────────

function StatusGroup({
  col,
  color,
  items,
  customFieldDefs,
  podeEditarItens,
  cols,
  setItems,
  patchItem,
  removeItem,
  onAddItem,
}: {
  col: KanbanColumnDef;
  color: string;
  items: WorkspaceListItemRow[];
  customFieldDefs: CustomFieldDef[];
  podeEditarItens: boolean;
  cols: KanbanColumnDef[];
  setItems: Dispatch<SetStateAction<WorkspaceListItemRow[]>>;
  patchItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  onAddItem: (statusKey: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      {/* Group header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `36px 1fr ${customFieldDefs.map(() => "160px").join(" ")} 36px`,
          alignItems: "center",
          minHeight: 36,
          background: `color-mix(in srgb, ${color} 6%, var(--surface-2))`,
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Toggle + status */}
        <div className="flex items-center justify-center">
          {open ? (
            <ChevronDown size={14} style={{ color }} />
          ) : (
            <ChevronRight size={14} style={{ color }} />
          )}
        </div>

        {/* Label + count */}
        <div className="flex items-center gap-2">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: color,
              flexShrink: 0,
              boxShadow: `0 0 0 2px color-mix(in srgb, ${color} 25%, transparent)`,
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {col.label}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--muted-fg)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "0 6px",
              minWidth: 20,
              textAlign: "center",
            }}
          >
            {items.length}
          </span>
        </div>

        {/* Custom field headers (empty for group) */}
        {customFieldDefs.map((f) => (
          <div key={f.id} style={{ borderLeft: "1px solid var(--border)" }} />
        ))}
        <div />
      </div>

      {/* Items */}
      {open && (
        <>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              cols={cols}
              customFieldDefs={customFieldDefs}
              podeEditarItens={podeEditarItens}
              colColor={color}
              setItems={setItems}
              patchItem={patchItem}
              removeItem={removeItem}
            />
          ))}

          {/* Add item row */}
          {podeEditarItens && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `36px 1fr ${customFieldDefs.map(() => "160px").join(" ")} 36px`,
                alignItems: "center",
                minHeight: 34,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div />
              <button
                type="button"
                onClick={() => onAddItem(col.key)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px 4px 0",
                  color: "var(--muted-fg)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; }}
              >
                <Plus size={12} />
                Adicionar Tarefa
              </button>
              {customFieldDefs.map((f) => (
                <div key={f.id} style={{ borderLeft: "1px solid var(--border)" }} />
              ))}
              <div />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Kanban card (quadro view) ───────────────────────────────────────────────

type KanbanCardProps = {
  item: WorkspaceListItemRow;
  cols: KanbanColumnDef[];
  customFieldDefs: CustomFieldDef[];
  podeEditarItens: boolean;
  setItems: Dispatch<SetStateAction<WorkspaceListItemRow[]>>;
  patchItem: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  dragProps: {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    dragging: boolean;
  };
};

function KanbanItemCard({
  item: it,
  cols,
  customFieldDefs,
  podeEditarItens,
  setItems,
  patchItem,
  removeItem,
  dragProps,
}: KanbanCardProps) {
  return (
    <Card
      padded={false}
      className="overflow-hidden"
      draggable={dragProps.draggable}
      onDragStart={dragProps.onDragStart}
      onDragEnd={dragProps.onDragEnd}
      style={{
        cursor: dragProps.draggable ? "grab" : "default",
        opacity: dragProps.dragging ? 0.65 : 1,
        border: "1px solid color-mix(in srgb, var(--primary) 12%, var(--border))",
        boxShadow: "0 4px 14px color-mix(in srgb, var(--foreground) 8%, transparent)",
        background:
          "linear-gradient(190deg, var(--surface) 0%, color-mix(in srgb, var(--surface-2) 45%, var(--surface)) 100%)",
      }}
    >
      <div
        className="h-0.5 w-full"
        style={{
          background: "linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 40%, var(--info)))",
        }}
      />
      <div className="p-3 space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Título</div>
          <Input
            value={it.title}
            onChange={(e) =>
              setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))
            }
            onBlur={(e) => {
              const t = e.target.value.trim();
              if (t && t !== it.title) void patchItem(it.id, { title: t });
            }}
            disabled={!podeEditarItens}
            className="text-sm font-bold"
            style={{ letterSpacing: "-0.02em" }}
          />
        </div>

        {customFieldDefs.length > 0 && (
          <div className="space-y-2.5 pt-1 border-t" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)" }}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted">Campos</div>
            {customFieldDefs.map((f) => (
              <div key={f.id}>
                <label className="text-[11px] font-semibold text-muted block mb-1">{f.name}</label>
                {f.type === "text" && (
                  <Input
                    value={String(it.custom_values[f.id] ?? "")}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === it.id ? { ...x, custom_values: { ...x.custom_values, [f.id]: e.target.value } } : x
                        )
                      )
                    }
                    onBlur={(e) => {
                      const next = { ...it.custom_values, [f.id]: e.target.value || null };
                      void patchItem(it.id, { custom_values: next });
                    }}
                    disabled={!podeEditarItens}
                    className="text-sm"
                  />
                )}
                {f.type === "number" && (
                  <Input
                    type="number"
                    value={it.custom_values[f.id] === null || it.custom_values[f.id] === undefined ? "" : String(it.custom_values[f.id])}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setItems((prev) =>
                        prev.map((x) => x.id === it.id ? { ...x, custom_values: { ...x.custom_values, [f.id]: v } } : x)
                      );
                    }}
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      void patchItem(it.id, { custom_values: { ...it.custom_values, [f.id]: v } });
                    }}
                    disabled={!podeEditarItens}
                    className="text-sm tabular-nums"
                  />
                )}
                {f.type === "date" && (
                  <Input
                    type="date"
                    value={String(it.custom_values[f.id] ?? "").slice(0, 10)}
                    onChange={(e) => void patchItem(it.id, { custom_values: { ...it.custom_values, [f.id]: e.target.value || null } })}
                    disabled={!podeEditarItens}
                    className="text-sm"
                  />
                )}
                {f.type === "select" && (
                  <Select
                    value={String(it.custom_values[f.id] ?? "")}
                    onChange={(e) => void patchItem(it.id, { custom_values: { ...it.custom_values, [f.id]: e.target.value || null } })}
                    disabled={!podeEditarItens}
                  >
                    <option value="">—</option>
                    {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="pt-1 border-t space-y-1.5" style={{ borderColor: "color-mix(in srgb, var(--border) 65%, transparent)" }}>
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Coluna do quadro</label>
          <Select
            value={it.status_key}
            onChange={(e) => void patchItem(it.id, { status_key: e.target.value })}
            disabled={!podeEditarItens}
            className="text-sm font-semibold"
          >
            {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </div>

        {podeEditarItens && (
          <Button size="sm" variant="danger-ghost" className="w-full" leftIcon={<Trash2 size={14} />} onClick={() => void removeItem(it.id)}>
            Excluir cartão
          </Button>
        )}
      </div>
    </Card>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ListItemsSection({
  listNodeId,
  projectId,
  enabled,
  defaultView,
  userViewMode,
  onUserViewModeChange,
  kanbanColumnsRaw,
  customFieldDefs,
  podeEditarItens,
}: Props) {
  const [items, setItems] = useState<WorkspaceListItemRow[]>([]);
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const cols = useMemo(() => parseKanbanColumns(kanbanColumnsRaw), [kanbanColumnsRaw]);
  const effectiveView = userViewMode ?? defaultView;

  const colColors = useMemo(
    () => Object.fromEntries(cols.map((c, i) => [c.key, getColColor(c, i)])),
    [cols]
  );

  const load = useCallback(async () => {
    if (!listNodeId) { setItems([]); setProjectTasks([]); return; }
    setLoading(true);

    // Load project tasks in parallel with workspace items
    const [tasksResult, itemsResult] = await Promise.all([
      projectId
        ? supabase
            .from("tasks")
            .select("id, title, status, priority, planned_due_date, assigned_to, description")
            .eq("project_id", projectId)
            .order("status")
            .order("planned_due_date", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [], error: null }),
      enabled
        ? supabase
            .from("workspace_list_items")
            .select("id, list_node_id, title, status_key, sort_order, custom_values, created_at")
            .eq("list_node_id", listNodeId)
            .order("sort_order")
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (tasksResult.error) {
      logSupabaseUnlessJwt("[list-items] tasks", tasksResult.error);
    } else {
      setProjectTasks((tasksResult.data ?? []) as ProjectTask[]);
    }

    if (itemsResult.error) {
      logSupabaseUnlessJwt("[list-items]", itemsResult.error);
      setItems([]);
    } else {
      const rows = (itemsResult.data || []) as Array<Omit<WorkspaceListItemRow, "custom_values"> & { custom_values?: unknown }>;
      setItems(rows.map((r) => ({ ...r, custom_values: parseCustomValues(r.custom_values) })));
    }

    setLoading(false);
  }, [enabled, listNodeId, projectId]);

  useEffect(() => { void load(); }, [load]);

  async function addItem(statusKey?: string) {
    if (!podeEditarItens || !listNodeId) return;
    const firstKey = statusKey ?? cols[0]?.key ?? DEFAULT_KANBAN_COLUMNS[0].key;
    const next = items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const profile = await getCurrentProfile();
    const { error } = await supabase.from("workspace_list_items").insert({
      list_node_id: listNodeId,
      title: "Nova tarefa",
      status_key: firstKey,
      sort_order: next,
      custom_values: {},
      created_by: profile?.id ?? null,
    });
    if (error) { showErrorToast("Não foi possível criar item", getSupabaseErrorMessage(error)); return; }
    await load();
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("workspace_list_items").update(patch).eq("id", id);
    if (error) { showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error)); return; }
    await load();
  }

  async function removeItem(id: string) {
    if (!window.confirm("Excluir este item?")) return;
    const { error } = await supabase.from("workspace_list_items").delete().eq("id", id);
    if (error) { showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error)); return; }
    await load();
  }

  async function deleteProjectTask(id: string) {
    if (!window.confirm("Excluir esta tarefa permanentemente? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { showErrorToast("Não foi possível excluir a tarefa", getSupabaseErrorMessage(error)); return; }
    setProjectTasks((prev) => prev.filter((t) => t.id !== id));
  }

  if (!enabled) {
    return (
      <Card className="p-4 m-4" style={{ background: "var(--surface-2)" }}>
        <p className="text-sm text-muted m-0">
          Itens da lista ficam disponíveis após executar{" "}
          <code>lib/sql/workspaces-spaces-extensions.sql</code> no Supabase.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        {/* View mode tabs */}
        <div
          className="flex rounded-lg p-0.5 gap-0.5"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <button
            type="button"
            onClick={() => onUserViewModeChange("list")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
            style={{
              background: effectiveView === "list" ? "var(--surface)" : "transparent",
              color: effectiveView === "list" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: effectiveView === "list" ? "var(--shadow-sm)" : "none",
            }}
          >
            <LayoutList size={13} /> Lista
          </button>
          <button
            type="button"
            onClick={() => onUserViewModeChange("kanban")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all"
            style={{
              background: effectiveView === "kanban" ? "var(--surface)" : "transparent",
              color: effectiveView === "kanban" ? "var(--primary)" : "var(--muted-fg)",
              boxShadow: effectiveView === "kanban" ? "var(--shadow-sm)" : "none",
            }}
          >
            <LayoutGrid size={13} /> Quadro
          </button>
        </div>

        {/* Add button */}
        {podeEditarItens && (
          <Button size="sm" leftIcon={<Plus size={13} />} onClick={() => void addItem()}>
            Add Tarefa
          </Button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 24 }}>
          <p className="text-sm text-muted">Carregando itens…</p>
        </div>
      )}

      {/* ── LISTA agrupada ── */}
      {!loading && effectiveView === "list" && (
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* ── Tarefas do projeto vinculado ── */}
          {projectId && (
            <ProjectTasksSection
              tasks={projectTasks}
              projectId={projectId}
              podeEditar={podeEditarItens}
              onDelete={(id) => void deleteProjectTask(id)}
            />
          )}

          {/* ── Itens da lista (workspace) ── */}
          {enabled && (
            <>
              {/* Section divider / header when project tasks are shown */}
              {projectId && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px 6px 8px",
                    background: "color-mix(in srgb, var(--warning) 5%, var(--surface-2))",
                    borderBottom: "1px solid var(--border)",
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--warning)" }}>
                    Itens personalizados
                  </span>
                  <span style={{ fontSize: 11, color: "var(--muted-fg)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "0 6px" }}>
                    {items.length}
                  </span>
                </div>
              )}

              {/* Column header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `36px 1fr ${customFieldDefs.map(() => "160px").join(" ")} 36px`,
                  alignItems: "center",
                  minHeight: 36,
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  position: "sticky",
                  top: projectId ? 33 : 0,
                  zIndex: 1,
                }}
              >
                <div />
                <div style={{ padding: "4px 8px 4px 0", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted-fg)" }}>
                  Nome
                </div>
                {customFieldDefs.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      padding: "4px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--muted-fg)",
                      borderLeft: "1px solid var(--border)",
                    }}
                  >
                    {f.name}
                  </div>
                ))}
                <div />
              </div>
            </>
          )}

          {/* Workspace item groups */}
          {enabled && (
            <>
              {cols.length === 0 && items.length === 0 && !projectId && (
                <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
                  Nenhum item. Clique em "Add Tarefa" para criar o primeiro.
                </div>
              )}
              {cols.map((col, idx) => (
                <StatusGroup
                  key={col.key}
                  col={col}
                  color={colColors[col.key] ?? getColColor(col, idx)}
                  items={items.filter((i) => i.status_key === col.key)}
                  customFieldDefs={customFieldDefs}
                  podeEditarItens={podeEditarItens}
                  cols={cols}
                  setItems={setItems}
                  patchItem={patchItem}
                  removeItem={removeItem}
                  onAddItem={addItem}
                />
              ))}
              {(() => {
                const knownKeys = new Set(cols.map((c) => c.key));
                const orphans = items.filter((i) => !knownKeys.has(i.status_key));
                if (!orphans.length) return null;
                return (
                  <StatusGroup
                    col={{ key: "__orphan__", label: "Sem status" }}
                    color="#64748b"
                    items={orphans}
                    customFieldDefs={customFieldDefs}
                    podeEditarItens={podeEditarItens}
                    cols={cols}
                    setItems={setItems}
                    patchItem={patchItem}
                    removeItem={removeItem}
                    onAddItem={addItem}
                  />
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* ── KANBAN ── */}
      {!loading && effectiveView === "kanban" && (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}>
          <div className="flex gap-3 p-4" style={{ minHeight: "100%", alignItems: "flex-start" }}>
            {cols.map((col, idx) => {
              const color = colColors[col.key] ?? getColColor(col, idx);
              const colItems = items.filter((i) => i.status_key === col.key);
              return (
                <div
                  key={col.key}
                  className="flex-shrink-0 rounded-xl flex flex-col"
                  style={{
                    width: 280,
                    minWidth: 280,
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("application/x-workspace-list-item");
                    if (!id) return;
                    void patchItem(id, { status_key: col.key });
                    setDragItemId(null);
                  }}
                >
                  <div
                    className="px-3 py-2.5 font-bold text-xs uppercase flex items-center justify-between gap-2"
                    style={{
                      borderBottom: `2px solid ${color}`,
                      color,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                      <span className="truncate">{col.label}</span>
                    </div>
                    <span
                      className="tabular-nums shrink-0 px-1.5 py-0.5 rounded-md text-[10px]"
                      style={{ background: "color-mix(in srgb, var(--foreground) 8%, transparent)", color: "var(--muted-fg)" }}
                    >
                      {colItems.length}
                    </span>
                  </div>
                  <div className="p-2.5 flex flex-col gap-3 flex-1 overflow-y-auto" style={{ maxHeight: 480 }}>
                    {colItems.map((it) => (
                      <KanbanItemCard
                        key={it.id}
                        item={it}
                        cols={cols}
                        customFieldDefs={customFieldDefs}
                        podeEditarItens={podeEditarItens}
                        setItems={setItems}
                        patchItem={patchItem}
                        removeItem={removeItem}
                        dragProps={{
                          draggable: podeEditarItens,
                          onDragStart: (e) => {
                            e.dataTransfer.setData("application/x-workspace-list-item", it.id);
                            setDragItemId(it.id);
                          },
                          onDragEnd: () => setDragItemId(null),
                          dragging: dragItemId === it.id,
                        }}
                      />
                    ))}
                    {podeEditarItens && (
                      <button
                        type="button"
                        onClick={() => void addItem(col.key)}
                        className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
                        style={{
                          background: "transparent",
                          border: "1px dashed var(--border)",
                          color: "var(--muted-fg)",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = color;
                          e.currentTarget.style.color = color;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--border)";
                          e.currentTarget.style.color = "var(--muted-fg)";
                        }}
                      >
                        <Plus size={12} /> Adicionar tarefa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
