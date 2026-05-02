"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  Check,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  BookOpen,
  AlertOctagon,
  Layers,
} from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import { showErrorToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskJournalInline } from "./task-journal-inline";
import {
  phaseStatusLabel,
  phaseStatusVariant,
} from "@/lib/saneamento/phases";
import type { ProjectPhase } from "@/lib/saneamento/types";
import {
  listProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  startTaskTimer,
  pauseTaskTimer,
  finishTask as finishTaskData,
  reopenTask as reopenTaskData,
  getJournalCountsByTask,
  type Task,
} from "@/lib/saneamento/data";
import {
  countBusinessDaysInclusive,
  dueDateFromBusinessDays,
  formatDate,
  formatDuration,
  getTodayLocalISO,
  isTaskDelayed,
} from "@/lib/utils";

type SimpleUser = { id: string; name: string };

type Props = {
  projectId: string;
  phases: ProjectPhase[];
  users: SimpleUser[];
};

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

export function TasksByPhase({ projectId, phases, users }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journalCounts, setJournalCounts] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  // Task creation form state (per phase)
  const [creatingForPhase, setCreatingForPhase] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newEstimatedDays, setNewEstimatedDays] = useState("");
  const [creating, setCreating] = useState(false);

  // Task edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editEstimatedDays, setEditEstimatedDays] = useState("");
  const [editPhaseId, setEditPhaseId] = useState("");

  // Task expand
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Phase section collapse state (default: collapsed for completed phases)
  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});

  // Inline delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Live tick
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

  async function loadAll() {
    setLoading(true);
    const [taskList, counts] = await Promise.all([
      listProjectTasks(projectId),
      getJournalCountsByTask(projectId),
    ]);
    setTasks(taskList);
    setJournalCounts(counts);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [projectId]);

  // Tasks agrupadas por phase_id
  const tasksByPhaseId = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.phase_id || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.order - b.order),
    [phases]
  );

  const orphanTasks = tasksByPhaseId.get("__none__") || [];

  // ─── Task CRUD ─────────────────────────────────────────────────────────

  async function handleCreate(phaseId: string | null) {
    if (!newTitle.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Usuário não autenticado.");
      return;
    }
    setCreating(true);
    const ok = await createTask({
      project_id: projectId,
      phase_id: phaseId,
      title: newTitle.trim(),
      created_by: profile.id,
      assigned_to: newAssignedTo || null,
      planned_due_date:
        dueDateFromBusinessDays(getTodayLocalISO(), Number(newEstimatedDays)) || null,
    });
    setCreating(false);
    if (!ok) {
      showErrorToast("Erro ao criar tarefa.");
      return;
    }
    setNewTitle("");
    setNewAssignedTo("");
    setNewEstimatedDays("");
    setCreatingForPhase(null);
    await loadAll();
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditAssignedTo(task.assigned_to || "");
    const startBase = task.start_date || getTodayLocalISO();
    const estimated = task.planned_due_date
      ? countBusinessDaysInclusive(startBase, task.planned_due_date)
      : 0;
    setEditEstimatedDays(estimated > 0 ? String(estimated) : "");
    setEditPhaseId(task.phase_id || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(taskId: string) {
    if (!editTitle.trim()) return;
    await updateTask(taskId, {
      title: editTitle.trim(),
      assigned_to: editAssignedTo || null,
      planned_due_date:
        dueDateFromBusinessDays(
          tasks.find((item) => item.id === taskId)?.start_date || getTodayLocalISO(),
          Number(editEstimatedDays)
        ) || null,
      phase_id: editPhaseId || null,
    });
    setEditingId(null);
    await loadAll();
  }

  async function handleDelete(taskId: string) {
    await deleteTask(taskId);
    if (expandedTaskId === taskId) setExpandedTaskId(null);
    setConfirmDeleteId(null);
    await loadAll();
  }

  async function startTimer(task: Task) {
    await startTaskTimer(task);
    await loadAll();
  }

  async function pauseTimer(task: Task) {
    await pauseTaskTimer(task);
    await loadAll();
  }

  async function finishTask(task: Task) {
    await finishTaskData(task);
    await loadAll();
  }

  async function reopenTask(task: Task) {
    await reopenTaskData(task);
    await loadAll();
  }

  // ─── Render helpers ────────────────────────────────────────────────────

  function renderTaskRow(task: Task, phaseId: string | null) {
    const isEditing = editingId === task.id;
    const isExpanded = expandedTaskId === task.id;
    const liveSeconds = getLiveSeconds(task);
    const delayed = isTaskDelayed(task);
    const assigned = users.find((u) => u.id === task.assigned_to);
    const journalCount = journalCounts.get(task.id) || 0;

    if (isEditing) {
      return (
        <div
          key={task.id}
          style={{
            padding: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div className="flex flex-col gap-3">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Título"
            />
            <div className="grid-3">
              <Select
                value={editPhaseId}
                onChange={(e) => setEditPhaseId(e.target.value)}
              >
                <option value="">— Sem etapa —</option>
                {sortedPhases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.order + 1}. {p.name}
                  </option>
                ))}
              </Select>
              <Select
                value={editAssignedTo}
                onChange={(e) => setEditAssignedTo(e.target.value)}
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
                  value={editEstimatedDays}
                  onChange={(e) => setEditEstimatedDays(e.target.value)}
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => saveEdit(task.id)}
                leftIcon={<Save size={13} />}
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit}>
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
        style={{
          background: "var(--surface)",
          border: "1px solid",
          borderColor: task.is_timer_running ? "#BBF7D0" : "var(--border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: task.is_timer_running ? "var(--success-soft)" : "transparent",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
            style={{
              background: "transparent",
              borderTop: "none",
              borderRight: "none",
              borderBottom: "none",
              borderLeft: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--muted-fg)",
            }}
            title={isExpanded ? "Recolher diário" : "Abrir diário"}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <strong
                style={{
                  fontSize: 14,
                  color: "var(--foreground)",
                  textDecoration:
                    task.status === "completed" ? "line-through" : "none",
                  opacity: task.status === "completed" ? 0.7 : 1,
                }}
              >
                {task.title}
              </strong>
              {delayed && <Badge variant="danger">Atrasada</Badge>}
              {journalCount > 0 && (
                <Badge variant="neutral">
                  <BookOpen size={10} style={{ marginRight: 2 }} />
                  {journalCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
              {assigned ? (
                <span className="flex items-center gap-1">
                  <Avatar name={assigned.name} size="sm" />
                  {assigned.name}
                </span>
              ) : (
                <span className="text-subtle">Sem responsável</span>
              )}
              {task.planned_due_date && (
                <span>Prazo: {formatDate(task.planned_due_date)}</span>
              )}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 9px",
              borderRadius: "var(--radius-sm)",
              background: task.is_timer_running
                ? "rgba(22, 163, 74, 0.18)"
                : "var(--surface-2)",
              border: "1px solid",
              borderColor: task.is_timer_running
                ? "#BBF7D0"
                : "var(--border)",
              minWidth: 88,
              justifyContent: "center",
            }}
          >
            <Clock
              size={11}
              style={{
                color: task.is_timer_running
                  ? "var(--success)"
                  : "var(--muted-fg)",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: task.is_timer_running
                  ? "var(--success-fg)"
                  : "var(--foreground)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatDuration(liveSeconds)}
            </span>
          </div>

          <div className="flex gap-1 items-center">
            {task.status !== "completed" && !task.is_timer_running && (
              <Button
                size="icon-sm"
                variant="primary"
                onClick={() => startTimer(task)}
                title="Iniciar"
              >
                <Play size={12} />
              </Button>
            )}
            {task.is_timer_running && (
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={() => pauseTimer(task)}
                title="Pausar"
              >
                <Pause size={12} />
              </Button>
            )}
            {task.status !== "completed" && (
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={() => finishTask(task)}
                title="Concluir"
              >
                <Check size={12} />
              </Button>
            )}
            {task.status === "completed" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => reopenTask(task)}
              >
                Reabrir
              </Button>
            )}
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => startEdit(task)}
              title="Editar"
            >
              <Pencil size={12} />
            </Button>
            {confirmDeleteId === task.id ? (
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleDelete(task.id)}
                >
                  Excluir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  <X size={12} />
                </Button>
              </>
            ) : (
              <Button
                size="icon-sm"
                variant="danger-ghost"
                onClick={() => setConfirmDeleteId(task.id)}
                title="Excluir"
              >
                <Trash2 size={12} />
              </Button>
            )}
          </div>
        </div>

        {isExpanded && (
          <TaskJournalInline
            taskId={task.id}
            projectId={projectId}
            phaseId={phaseId}
            users={users}
            onChanged={loadAll}
          />
        )}
      </div>
    );
  }

  function renderInlineCreate(phaseId: string | null) {
    const isOpen = creatingForPhase === (phaseId ?? "__none__");
    if (!isOpen) {
      return (
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Plus size={14} />}
          onClick={() => {
            setCreatingForPhase(phaseId ?? "__none__");
            setNewTitle("");
            setNewAssignedTo("");
            setNewEstimatedDays("");
          }}
        >
          Nova tarefa{phaseId ? " nesta etapa" : ""}
        </Button>
      );
    }
    return (
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <div className="flex flex-col gap-3">
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Título da tarefa..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) handleCreate(phaseId);
              if (e.key === "Escape") setCreatingForPhase(null);
            }}
          />
          <div className="grid-2">
            <Select
              value={newAssignedTo}
              onChange={(e) => setNewAssignedTo(e.target.value)}
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
                value={newEstimatedDays}
                onChange={(e) => setNewEstimatedDays(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleCreate(phaseId)}
              loading={creating}
              disabled={!newTitle.trim()}
              leftIcon={<Save size={13} />}
            >
              Criar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreatingForPhase(null)}
              leftIcon={<X size={13} />}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function togglePhaseCollapsed(phaseKey: string) {
    setCollapsedPhases((s) => ({ ...s, [phaseKey]: !s[phaseKey] }));
  }

  function renderPhaseSection(opts: {
    key: string;
    phase: ProjectPhase | null;
    tasks: Task[];
  }) {
    const { key, phase, tasks: phaseTasks } = opts;
    const collapsed = collapsedPhases[key] ?? false;

    const total = phaseTasks.length;
    const done = phaseTasks.filter((t) => t.status === "completed").length;
    const inProgress = phaseTasks.filter(
      (t) => t.status === "in_progress"
    ).length;
    const delayed = phaseTasks.filter(isTaskDelayed).length;
    const phaseId = phase?.id ?? null;

    return (
      <Card key={key} padded={false}>
        <button
          type="button"
          onClick={() => togglePhaseCollapsed(key)}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            background: "transparent",
            borderTop: "none",
            borderRight: "none",
            borderLeft: "none",
            borderBottom: collapsed ? "none" : "1px solid var(--border)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {collapsed ? (
            <ChevronRight size={16} className="text-muted" />
          ) : (
            <ChevronDown size={16} className="text-muted" />
          )}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: phase ? "var(--primary-soft)" : "var(--surface-3)",
              color: phase ? "var(--primary)" : "var(--muted-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {phase ? phase.order + 1 : <Layers size={13} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <strong className="text-md">
                {phase ? phase.name : "Tarefas sem etapa"}
              </strong>
              {phase && (
                <Badge variant={phaseStatusVariant[phase.status]}>
                  {phaseStatusLabel[phase.status]}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
              <span>
                {total} tarefa{total === 1 ? "" : "s"}
              </span>
              {inProgress > 0 && <span>· {inProgress} em andamento</span>}
              {done > 0 && <span>· {done} concluída{done === 1 ? "" : "s"}</span>}
              {delayed > 0 && (
                <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                  · {delayed} em atraso
                </span>
              )}
            </div>
          </div>
          {delayed > 0 && (
            <AlertOctagon size={16} style={{ color: "var(--danger)" }} />
          )}
        </button>

        {!collapsed && (
          <div
            style={{
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {phaseTasks.length === 0 ? (
              <p
                className="text-sm text-muted"
                style={{ margin: 0, padding: "8px 4px" }}
              >
                {phase
                  ? "Sem tarefas nesta etapa ainda."
                  : "Sem tarefas órfãs."}
              </p>
            ) : (
              phaseTasks.map((t) => renderTaskRow(t, phaseId))
            )}

            {phase && renderInlineCreate(phaseId)}
          </div>
        )}
      </Card>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="card-title">Tarefas por etapa</div>
          <p className="text-sm text-muted mt-1">
            Crie e acompanhe tarefas dentro de cada fase. Clique em uma tarefa
            pra abrir o diário e registrar avanços ou motivos de atraso.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 80 }} />
          <Skeleton style={{ height: 80 }} />
          <Skeleton style={{ height: 80 }} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedPhases.map((phase) =>
            renderPhaseSection({
              key: phase.id,
              phase,
              tasks: tasksByPhaseId.get(phase.id) || [],
            })
          )}
          {orphanTasks.length > 0 &&
            renderPhaseSection({
              key: "__none__",
              phase: null,
              tasks: orphanTasks,
            })}
        </div>
      )}
    </Card>
  );
}
