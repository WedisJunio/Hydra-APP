"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  Check,
  Pencil,
  Trash2,
  Clock,
  CheckSquare,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Filter,
} from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  listProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  startTaskTimer,
  pauseTaskTimer,
  finishTask as finishTaskData,
  reopenTask as reopenTaskData,
} from "@/lib/saneamento/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatsGrid } from "@/components/ui/stat";
import {
  countBusinessDaysInclusive,
  dueDateFromBusinessDays,
  formatDate,
  formatDuration,
  getTodayLocalISO,
  isTaskDelayed,
} from "@/lib/utils";
import type { ProjectPhase } from "@/lib/saneamento/types";

type Task = {
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

type SimpleUser = { id: string; name: string };

type Props = {
  projectId: string;
  users: SimpleUser[];
  phases: ProjectPhase[];
};

const STATUS_GROUPS = [
  { status: "in_progress", title: "Em andamento", variant: "info" as const },
  { status: "pending", title: "Pendentes", variant: "warning" as const },
  { status: "completed", title: "Concluídas", variant: "success" as const },
];

const NO_PHASE = "__none__";

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

export function TasksTab({ projectId, users, phases }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    completed: true,
  });
  const [phaseFilter, setPhaseFilter] = useState<string>("");

  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.order - b.order),
    [phases]
  );
  const phaseById = useMemo(
    () => new Map(phases.map((p) => [p.id, p])),
    [phases]
  );

  // create form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newEstimatedDays, setNewEstimatedDays] = useState("");
  const [newPhaseId, setNewPhaseId] = useState("");
  const [creating, setCreating] = useState(false);

  // edit form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editEstimatedDays, setEditEstimatedDays] = useState("");
  const [editPhaseId, setEditPhaseId] = useState("");

  // tick — só roda quando há timer ativo
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

  async function loadTasks() {
    setLoading(true);
    const list = await listProjectTasks(projectId);
    setTasks(list as unknown as Task[]);
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  // pré-seleciona a primeira etapa em andamento como sugestão
  useEffect(() => {
    if (newPhaseId) return;
    const inProgress = sortedPhases.find((p) => p.status === "in_progress");
    if (inProgress) setNewPhaseId(inProgress.id);
  }, [sortedPhases, newPhaseId]);

  const filteredTasks = useMemo(() => {
    if (!phaseFilter) return tasks;
    if (phaseFilter === NO_PHASE) return tasks.filter((t) => !t.phase_id);
    return tasks.filter((t) => t.phase_id === phaseFilter);
  }, [tasks, phaseFilter]);

  const stats = useMemo(() => {
    const base = phaseFilter ? filteredTasks : tasks;
    return {
      total: base.length,
      pending: base.filter((t) => t.status === "pending").length,
      inProgress: base.filter((t) => t.status === "in_progress").length,
      completed: base.filter((t) => t.status === "completed").length,
      delayed: base.filter(isTaskDelayed).length,
      totalSeconds: base.reduce((s, t) => s + getLiveSeconds(t), 0),
    };
  }, [tasks, filteredTasks, phaseFilter]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      alert("Usuário não autenticado.");
      return;
    }
    setCreating(true);
    const ok = await createTask({
      title: newTitle.trim(),
      description: newDescription || null,
      project_id: projectId,
      phase_id: newPhaseId || null,
      created_by: profile.id,
      assigned_to: newAssignedTo || null,
      planned_due_date:
        dueDateFromBusinessDays(getTodayLocalISO(), Number(newEstimatedDays)) || null,
    });
    if (!ok) {
      alert("Erro ao criar tarefa.");
      setCreating(false);
      return;
    }
    setNewTitle("");
    setNewDescription("");
    setNewAssignedTo("");
    setNewEstimatedDays("");
    setShowForm(false);
    setCreating(false);
    await loadTasks();
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || "");
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
      description: editDescription || null,
      assigned_to: editAssignedTo || null,
      planned_due_date:
        dueDateFromBusinessDays(
          tasks.find((task) => task.id === taskId)?.start_date || getTodayLocalISO(),
          Number(editEstimatedDays)
        ) || null,
      phase_id: editPhaseId || null,
    });
    setEditingId(null);
    await loadTasks();
  }

  async function handleDelete(taskId: string) {
    if (!window.confirm("Excluir esta tarefa?")) return;
    await deleteTask(taskId);
    await loadTasks();
  }

  async function startTimer(task: Task) {
    await startTaskTimer(task);
    await loadTasks();
  }

  async function pauseTimer(task: Task) {
    await pauseTaskTimer(task);
    await loadTasks();
  }

  async function finishTask(task: Task) {
    await finishTaskData(task);
    await loadTasks();
  }

  async function reopenTask(task: Task) {
    await reopenTaskData(task);
    await loadTasks();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3
            className="text-lg font-bold m-0"
            style={{ letterSpacing: "-0.01em" }}
          >
            Tarefas do projeto
          </h3>
          <p className="text-sm text-muted mt-1">
            Atividades técnicas, com cronômetro e prazos. Cada tarefa pode ser
            vinculada a uma fase do projeto.
          </p>
        </div>
        <Button
          leftIcon={<Plus size={16} />}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Fechar" : "Nova tarefa"}
        </Button>
      </div>

      <StatsGrid>
        <Stat label="Total" value={stats.total} />
        <Stat
          label="Em andamento"
          value={stats.inProgress}
          icon={<Clock size={14} />}
        />
        <Stat
          label="Concluídas"
          value={stats.completed}
          icon={<Check size={14} />}
        />
        <Stat
          label="Em atraso"
          value={stats.delayed}
          trendVariant={stats.delayed > 0 ? "down" : "up"}
        />
        <Stat
          label="Tempo produzido"
          value={formatDuration(stats.totalSeconds)}
        />
      </StatsGrid>

      {/* Filtro por fase */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Filter size={14} className="text-muted" />
          <span className="text-sm font-semibold">Filtrar por fase:</span>
          <Select
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
            style={{ width: "auto", minWidth: 240 }}
          >
            <option value="">Todas as fases</option>
            {sortedPhases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NO_PHASE}>Sem fase vinculada</option>
          </Select>
          {phaseFilter && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={12} />}
              onClick={() => setPhaseFilter("")}
            >
              Limpar
            </Button>
          )}
          <span className="text-sm text-muted" style={{ marginLeft: "auto" }}>
            {filteredTasks.length} tarefa{filteredTasks.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      {showForm && (
        <Card>
          <div className="flex flex-col gap-3">
            <Field label="Título da tarefa">
              <Input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex.: Cálculo de adutora — trecho 1"
              />
            </Field>
            <Field label="Descrição">
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Detalhes, escopo, observações..."
              />
            </Field>
            <Field
              label="Fase do projeto"
              help="Defina em qual fase essa tarefa entra. Pode deixar vazio se for transversal."
            >
              <Select
                value={newPhaseId}
                onChange={(e) => setNewPhaseId(e.target.value)}
              >
                <option value="">— Sem fase específica —</option>
                {sortedPhases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.order + 1}. {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid-2">
              <Field label="Responsável">
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
              </Field>
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
            <p className="text-xs text-muted m-0">
              Prazo calculado automaticamente em dias uteis.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                loading={creating}
                disabled={!newTitle.trim()}
                leftIcon={<Save size={14} />}
              >
                Criar tarefa
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 64 }} />
          <Skeleton style={{ height: 64 }} />
          <Skeleton style={{ height: 64 }} />
        </div>
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare size={22} />}
          title={
            phaseFilter ? "Nenhuma tarefa nesta fase" : "Sem tarefas neste projeto"
          }
          description={
            phaseFilter
              ? "Tente outra fase ou limpe o filtro pra ver tudo."
              : "Crie a primeira tarefa pra começar a registrar produção."
          }
          action={
            !phaseFilter ? (
              <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm(true)}>
                Nova tarefa
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setPhaseFilter("")}>
                Limpar filtro
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {STATUS_GROUPS.map((group) => {
            const groupTasks = filteredTasks.filter(
              (t) => t.status === group.status
            );
            if (groupTasks.length === 0) return null;
            const isCollapsed = !!collapsed[group.status];

            return (
              <Card key={group.status} padded={false}>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((s) => ({
                      ...s,
                      [group.status]: !s[group.status],
                    }))
                  }
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    borderTop: "none",
                    borderRight: "none",
                    borderLeft: "none",
                    borderBottom: isCollapsed ? "none" : "1px solid var(--border)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight size={16} className="text-muted" />
                    ) : (
                      <ChevronDown size={16} className="text-muted" />
                    )}
                    <Badge variant={group.variant} dot>
                      {group.title}
                    </Badge>
                    <span className="text-sm text-muted">
                      {groupTasks.length}
                    </span>
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="flex flex-col" style={{ padding: 8 }}>
                    {groupTasks.map((task) => {
                      const isEditing = editingId === task.id;
                      const liveSeconds = getLiveSeconds(task);
                      const delayed = isTaskDelayed(task);
                      const assigned = users.find(
                        (u) => u.id === task.assigned_to
                      );
                      const taskPhase = task.phase_id
                        ? phaseById.get(task.phase_id)
                        : null;

                      if (isEditing) {
                        return (
                          <div
                            key={task.id}
                            style={{
                              padding: 14,
                              borderRadius: "var(--radius-md)",
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                              margin: 2,
                            }}
                          >
                            <div className="flex flex-col gap-3">
                              <Input
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                placeholder="Título"
                              />
                              <Textarea
                                value={editDescription}
                                onChange={(e) =>
                                  setEditDescription(e.target.value)
                                }
                                placeholder="Descrição"
                                style={{ minHeight: 60 }}
                              />
                              <Field label="Fase">
                                <Select
                                  value={editPhaseId}
                                  onChange={(e) =>
                                    setEditPhaseId(e.target.value)
                                  }
                                >
                                  <option value="">— Sem fase específica —</option>
                                  {sortedPhases.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.order + 1}. {p.name}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <div className="grid-2">
                                <Select
                                  value={editAssignedTo}
                                  onChange={(e) =>
                                    setEditAssignedTo(e.target.value)
                                  }
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
                                    onChange={(e) =>
                                      setEditEstimatedDays(e.target.value)
                                    }
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                  leftIcon={<X size={13} />}
                                >
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
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "12px 14px",
                            borderRadius: "var(--radius-md)",
                            background: task.is_timer_running
                              ? "var(--success-soft)"
                              : "transparent",
                            border: task.is_timer_running
                              ? "1px solid #BBF7D0"
                              : "1px solid transparent",
                            margin: 2,
                            flexWrap: "wrap",
                          }}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <strong
                                style={{
                                  fontSize: 14,
                                  color: "var(--foreground)",
                                  textDecoration:
                                    task.status === "completed"
                                      ? "line-through"
                                      : "none",
                                  opacity: task.status === "completed" ? 0.7 : 1,
                                }}
                              >
                                {task.title}
                              </strong>
                              {taskPhase && (
                                <Badge variant="primary">
                                  <GitBranch
                                    size={10}
                                    style={{ marginRight: 2 }}
                                  />
                                  {taskPhase.name}
                                </Badge>
                              )}
                              {delayed && <Badge variant="danger">Atrasada</Badge>}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                              {assigned ? (
                                <span className="flex items-center gap-1">
                                  <Avatar name={assigned.name} size="sm" />
                                  {assigned.name}
                                </span>
                              ) : (
                                <span className="text-subtle">
                                  Sem responsável
                                </span>
                              )}
                              {task.planned_due_date && (
                                <span>
                                  Prazo: {formatDate(task.planned_due_date)}
                                </span>
                              )}
                              {task.actual_completed_date && (
                                <span>
                                  Concluída em{" "}
                                  {formatDate(task.actual_completed_date)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 10px",
                              borderRadius: "var(--radius-sm)",
                              background: task.is_timer_running
                                ? "rgba(22, 163, 74, 0.15)"
                                : "var(--surface-2)",
                              border: "1px solid",
                              borderColor: task.is_timer_running
                                ? "#BBF7D0"
                                : "var(--border)",
                              minWidth: 100,
                              justifyContent: "center",
                            }}
                          >
                            <Clock
                              size={12}
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

                          <div className="flex gap-1">
                            {task.status !== "completed" &&
                              !task.is_timer_running && (
                                <Button
                                  size="icon-sm"
                                  variant="primary"
                                  onClick={() => startTimer(task)}
                                  title="Iniciar cronômetro"
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
                                title="Reabrir"
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
                            <Button
                              size="icon-sm"
                              variant="danger-ghost"
                              onClick={() => handleDelete(task.id)}
                              title="Excluir"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
