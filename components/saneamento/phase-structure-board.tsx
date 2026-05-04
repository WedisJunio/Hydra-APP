"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowDown,
  ArrowUp,
  Layers,
  CheckSquare,
  CalendarClock,
  Flag,
  User,
  MessageSquare,
  Paperclip,
  BookOpen,
} from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import {
  listProjectTasks,
  createTask,
  updateTask,
  deleteTask,
  getJournalCountsByTask,
  type Task,
  type UpdateTaskInput,
  listPhaseTitles,
  createPhaseTitle,
  updatePhaseTitle,
  deletePhaseTitle,
  rewriteTitleOrders,
  listPhaseSubtitles,
  deletePhaseSubtitle,
  type PhaseTitle,
} from "@/lib/saneamento/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskJournalInline } from "./task-journal-inline";
import {
  countBusinessDaysInclusive,
  dueDateFromBusinessDays,
  formatDate,
  getTodayLocalISO,
} from "@/lib/utils";
import type { ProjectPhase } from "@/lib/saneamento/types";

type SimpleUser = { id: string; name: string };

type Props = {
  projectId: string;
  phases: ProjectPhase[];
  users: SimpleUser[];
};

type TaskFormState = {
  title: string;
  description: string;
  assigned_to: string;
  planned_due_date: string;
  status: string;
  priority: "low" | "medium" | "high" | "critical";
  start_date: string;
  comments: string;
  attachmentsText: string;
};

const DEFAULT_TASK_FORM: TaskFormState = {
  title: "",
  description: "",
  assigned_to: "",
  planned_due_date: "",
  status: "pending",
  priority: "medium",
  start_date: "",
  comments: "",
  attachmentsText: "",
};

const PROJECT_TYPE_OPTIONS = [
  { value: "SAA", label: "Sistema de abastecimento de água" },
  { value: "SES", label: "Sistema de esgotamento sanitário" },
] as const;

function parseAttachments(text: string) {
  return text
    .split(/\n|,/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function statusBadge(status: string) {
  if (status === "completed") return <Badge variant="success">Concluída</Badge>;
  if (status === "in_progress") return <Badge variant="info">Em andamento</Badge>;
  return <Badge variant="warning">Pendente</Badge>;
}

function priorityBadge(priority: Task["priority"]) {
  if (priority === "critical") return <Badge variant="danger">Crítica</Badge>;
  if (priority === "high") return <Badge variant="warning">Alta</Badge>;
  if (priority === "low") return <Badge variant="neutral">Baixa</Badge>;
  return <Badge variant="info">Média</Badge>;
}

export function PhaseStructureBoard({ projectId, phases, users }: Props) {
  const [titles, setTitles] = useState<PhaseTitle[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [journalCounts, setJournalCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [collapsedPhases, setCollapsedPhases] = useState<Record<string, boolean>>({});
  const [collapsedTitles, setCollapsedTitles] = useState<Record<string, boolean>>({});

  const [addingTitlePhaseId, setAddingTitlePhaseId] = useState<string | null>(null);
  const [newTitleSystemType, setNewTitleSystemType] = useState<"SAA" | "SES">("SAA");

  const [addingTaskTitleId, setAddingTaskTitleId] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState<TaskFormState>(DEFAULT_TASK_FORM);

  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleName, setEditingTitleName] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskForm, setEditingTaskForm] = useState<TaskFormState>(DEFAULT_TASK_FORM);

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);

  const phaseById = useMemo(() => new Map(phases.map((phase) => [phase.id, phase])), [phases]);
  const titleById = useMemo(() => new Map(titles.map((title) => [title.id, title])), [titles]);
  const sortedPhases = useMemo(() => [...phases].sort((a, b) => a.order - b.order), [phases]);
  const canEditStartDate = useMemo(
    () =>
      currentRole === "leader" ||
      currentRole === "coordinator" ||
      currentRole === "admin",
    [currentRole]
  );

  const titlesByPhase = useMemo(() => {
    const map = new Map<string, PhaseTitle[]>();
    for (const title of titles) {
      if (!map.has(title.phase_id)) map.set(title.phase_id, []);
      map.get(title.phase_id)!.push(title);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [titles]);

  const tasksByTitle = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.title_id) continue;
      if (!map.has(task.title_id)) map.set(task.title_id, []);
      map.get(task.title_id)!.push(task);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.phase_task_order || 0) - (b.phase_task_order || 0));
    }
    return map;
  }, [tasks]);

  /** Tarefas com fase definida mas sem tipo (SAA/SES) — comuns ao criar na tela geral de tarefas. */
  const orphanTasksByPhase = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.title_id) continue;
      if (!task.phase_id) continue;
      if (!map.has(task.phase_id)) map.set(task.phase_id, []);
      map.get(task.phase_id)!.push(task);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.phase_task_order || 0) - (b.phase_task_order || 0));
    }
    return map;
  }, [tasks]);

  const phaseTaskStats = useMemo(() => {
    const stats = new Map<string, { total: number; completed: number }>();
    for (const phase of phases) {
      const inPhase = tasks.filter((t) => t.phase_id === phase.id);
      stats.set(phase.id, {
        total: inPhase.length,
        completed: inPhase.filter((t) => t.status === "completed").length,
      });
    }
    return stats;
  }, [tasks, phases]);

  async function normalizeLegacySubtitles(
    currentTasks: Task[],
    currentTitles: PhaseTitle[]
  ): Promise<boolean> {
    const subtitles = await listPhaseSubtitles(projectId);
    if (subtitles.length === 0) return false;

    const profile = await getCurrentProfile();
    if (!profile) return false;

    const tasksBySubtitle = new Map<string, Task[]>();
    for (const task of currentTasks) {
      if (!task.subtitle_id) continue;
      if (!tasksBySubtitle.has(task.subtitle_id)) tasksBySubtitle.set(task.subtitle_id, []);
      tasksBySubtitle.get(task.subtitle_id)!.push(task);
    }

    let changed = false;
    for (const subtitle of subtitles) {
      const title = currentTitles.find((item) => item.id === subtitle.title_id);
      const phase = title ? phaseById.get(title.phase_id) : null;
      if (!title) continue;

      const linked = tasksBySubtitle.get(subtitle.id) || [];
      if (linked.length === 0) {
        await createTask({
          project_id: projectId,
          phase_id: phase?.id || null,
          title_id: title.id,
          subtitle_id: null,
          title: subtitle.name,
          created_by: profile.id,
          priority: "medium",
          phase_task_order: (tasksByTitle.get(title.id)?.length || 0) + 1,
        });
        changed = true;
      } else {
        await Promise.all(linked.map((task) => updateTask(task.id, { subtitle_id: null })));
        changed = true;
      }

      await deletePhaseSubtitle(subtitle.id);
      changed = true;
    }

    return changed;
  }

  async function rewriteTaskOrdersForTitle(titleId: string, sourceTasks: Task[]) {
    const siblings = sourceTasks
      .filter((task) => task.title_id === titleId)
      .sort((a, b) => (a.phase_task_order || 0) - (b.phase_task_order || 0));
    await Promise.all(
      siblings.map((task, index) => updateTask(task.id, { phase_task_order: index }))
    );
  }

  async function loadAll() {
    setLoading(true);
    const profile = await getCurrentProfile();
    setCurrentRole(profile?.role || null);
    const [taskListInitial, counts, titleList] = await Promise.all([
      listProjectTasks(projectId),
      getJournalCountsByTask(projectId),
      listPhaseTitles(projectId),
    ]);

    const legacyChanged = await normalizeLegacySubtitles(taskListInitial, titleList);
    const taskList = legacyChanged ? await listProjectTasks(projectId) : taskListInitial;

    const tasksByTitleLocal = new Map<string, Task[]>();
    for (const task of taskList) {
      if (!task.title_id) continue;
      if (!tasksByTitleLocal.has(task.title_id)) tasksByTitleLocal.set(task.title_id, []);
      tasksByTitleLocal.get(task.title_id)!.push(task);
    }

    const orderFixPromises: Promise<void>[] = [];
    for (const [titleId, list] of tasksByTitleLocal.entries()) {
      const ordered = [...list].sort((a, b) => (a.phase_task_order || 0) - (b.phase_task_order || 0));
      ordered.forEach((task, index) => {
        if ((task.phase_task_order || 0) !== index) {
          orderFixPromises.push(updateTask(task.id, { phase_task_order: index }));
        }
      });
      if (list.some((task) => task.subtitle_id)) {
        orderFixPromises.push(...list.map((task) => updateTask(task.id, { subtitle_id: null })));
      }
    }

    if (orderFixPromises.length > 0) {
      await Promise.all(orderFixPromises);
    }

    const finalTasks =
      legacyChanged || orderFixPromises.length > 0 ? await listProjectTasks(projectId) : taskList;

    setTasks(finalTasks);
    setJournalCounts(counts);
    setTitles(titleList);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, [projectId]);

  function resetTaskForm() {
    setTaskForm({ ...DEFAULT_TASK_FORM, start_date: getTodayLocalISO() });
    setAddingTaskTitleId(null);
  }

  function nextTitleOrder(phaseId: string) {
    return (titlesByPhase.get(phaseId)?.length || 0) + 1;
  }

  function nextTaskOrder(titleId: string) {
    const siblings = tasksByTitle.get(titleId) || [];
    if (siblings.length === 0) return 0;
    return Math.max(...siblings.map((task) => task.phase_task_order || 0)) + 1;
  }

  async function handleAddTitle(phaseId: string) {
    const selected = PROJECT_TYPE_OPTIONS.find(
      (option) => option.value === newTitleSystemType
    );
    if (!selected) return;
    setBusy(true);
    await createPhaseTitle({
      phaseId,
      name: selected.label,
      order: nextTitleOrder(phaseId),
    });
    setBusy(false);
    setAddingTitlePhaseId(null);
    setNewTitleSystemType("SAA");
    await loadAll();
  }

  async function handleDeleteTitle(titleId: string) {
    if (!window.confirm("Excluir este tipo de projeto?")) return;
    setBusy(true);
    await deletePhaseTitle(titleId);
    setBusy(false);
    await loadAll();
  }

  async function moveTitle(titleId: string, direction: "up" | "down") {
    const title = titleById.get(titleId);
    if (!title) return;
    const siblings = [...(titlesByPhase.get(title.phase_id) || [])];
    const index = siblings.findIndex((item) => item.id === titleId);
    if (index < 0) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === siblings.length - 1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];

    setBusy(true);
    await rewriteTitleOrders(siblings, title.phase_id);
    setBusy(false);
    await loadAll();
  }

  async function handleCreateTask(titleId: string) {
    if (!taskForm.title.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) return;

    const title = titleById.get(titleId);
    const phase = title ? phaseById.get(title.phase_id) : null;
    setBusy(true);
    const ok = await createTask({
      project_id: projectId,
      phase_id: phase?.id || null,
      title_id: title?.id || null,
      subtitle_id: null,
      title: taskForm.title.trim(),
      description: taskForm.description || null,
      assigned_to: taskForm.assigned_to || null,
      planned_due_date: taskForm.planned_due_date || null,
      priority: taskForm.priority,
      comments: taskForm.comments || null,
      attachments: parseAttachments(taskForm.attachmentsText),
      status: taskForm.status,
      phase_task_order: nextTaskOrder(titleId),
      created_by: profile.id,
      start_date: getTodayLocalISO(),
    });
    setBusy(false);
    if (!ok) return;
    resetTaskForm();
    await loadAll();
  }

  async function handleDeleteTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!window.confirm("Excluir esta tarefa?")) return;
    setBusy(true);
    await deleteTask(taskId);
    if (task?.title_id) {
      await rewriteTaskOrdersForTitle(task.title_id, tasks);
    }
    setBusy(false);
    await loadAll();
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id);
    setEditingTaskForm({
      title: task.title || "",
      description: task.description || "",
      assigned_to: task.assigned_to || "",
      planned_due_date: task.planned_due_date || "",
      status: task.status || "pending",
      priority: task.priority || "medium",
      start_date: task.start_date || "",
      comments: task.comments || "",
      attachmentsText: (task.attachments || []).join("\n"),
    });
  }

  async function saveTaskEdit(task: Task) {
    const patch: UpdateTaskInput = {
      title: editingTaskForm.title.trim(),
      description: editingTaskForm.description || null,
      assigned_to: editingTaskForm.assigned_to || null,
      planned_due_date: editingTaskForm.planned_due_date || null,
      priority: editingTaskForm.priority,
      comments: editingTaskForm.comments || null,
      attachments: parseAttachments(editingTaskForm.attachmentsText),
      subtitle_id: null,
    };
    if (canEditStartDate) {
      patch.start_date = editingTaskForm.start_date || null;
    }
    if (task.status !== editingTaskForm.status) {
      patch.status = editingTaskForm.status;
      if (editingTaskForm.status === "completed") {
        patch.completion_date = getTodayLocalISO();
        patch.actual_completed_date = getTodayLocalISO();
      } else {
        patch.completion_date = null;
        patch.actual_completed_date = null;
      }
    }

    setBusy(true);
    await updateTask(task.id, patch);
    setBusy(false);
    setEditingTaskId(null);
    await loadAll();
  }

  async function moveTask(task: Task, direction: "up" | "down") {
    if (!task.title_id) return;
    const siblings = [...(tasksByTitle.get(task.title_id) || [])];
    const index = siblings.findIndex((item) => item.id === task.id);
    if (index < 0) return;
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === siblings.length - 1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];

    setBusy(true);
    await Promise.all(
      siblings.map((item, order) =>
        updateTask(item.id, { phase_task_order: order, subtitle_id: null })
      )
    );
    setBusy(false);
    await loadAll();
  }

  async function handleLinkOrphanToTitle(task: Task, titleId: string) {
    if (!titleId || task.title_id === titleId) return;
    const order = nextTaskOrder(titleId);
    setBusy(true);
    await updateTask(task.id, {
      title_id: titleId,
      subtitle_id: null,
      phase_task_order: order,
    });
    setBusy(false);
    await loadAll();
  }

  if (loading) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 80 }} />
          <Skeleton style={{ height: 80 }} />
          <Skeleton style={{ height: 80 }} />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <div className="card-title">Tipos do Projeto</div>
          <p className="text-sm text-muted mt-1">
            Fase {'->'} Tipo de projeto (SAA/SES) {'->'} Tarefas.
            Tarefas criadas na página geral podem aparecer abaixo como &quot;sem tipo&quot; até você
            vinculá-las. Use o botão <strong>Tipo de projeto</strong> em cada fase para começar.
          </p>
        </div>
        {busy && <Badge variant="info">Salvando...</Badge>}
      </div>

      <div className="flex flex-col gap-3">
        {sortedPhases.map((phase) => {
          const phaseTitles = titlesByPhase.get(phase.id) || [];
          const phaseCollapsed = !!collapsedPhases[phase.id];
          const orphanInPhase = orphanTasksByPhase.get(phase.id) || [];
          const st = phaseTaskStats.get(phase.id) || { total: 0, completed: 0 };
          return (
            <div key={phase.id} className="card">
              <div
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderBottom: phaseCollapsed ? "none" : "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedPhases((prev) => ({ ...prev, [phase.id]: !prev[phase.id] }))
                  }
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    padding: 0,
                  }}
                >
                  {phaseCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  <div
                    className="flex items-center justify-center rounded-md bg-primary-soft text-primary"
                    style={{ width: 30, height: 30 }}
                  >
                    <Layers size={15} />
                  </div>
                  <div className="flex-1">
                    <strong>{phase.name}</strong>
                    <div className="text-xs text-muted mt-1">
                      {phaseTitles.length} tipo(s) de projeto
                      {st.total > 0 ? (
                        <>
                          {" · "}
                          <span style={{ color: "var(--success)" }}>{st.completed}</span>
                          {" / "}
                          {st.total} tarefa(s) concluída(s) nesta fase
                        </>
                      ) : (
                        <> · nenhuma tarefa vinculada à fase ainda</>
                      )}
                    </div>
                  </div>
                </button>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Plus size={12} />}
                  onClick={() => {
                    setAddingTitlePhaseId(phase.id);
                    setNewTitleSystemType("SAA");
                  }}
                >
                  Tipo de projeto
                </Button>
              </div>

              {!phaseCollapsed && (
                <div style={{ padding: 12 }} className="flex flex-col gap-2">
                  {addingTitlePhaseId === phase.id && (
                    <div className="card" style={{ padding: 10 }}>
                      <Field label="Tipo de projeto">
                        <Select
                          value={newTitleSystemType}
                          onChange={(event) =>
                            setNewTitleSystemType(event.target.value as "SAA" | "SES")
                          }
                        >
                          {PROJECT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={() => handleAddTitle(phase.id)} leftIcon={<Save size={12} />}>
                          Salvar tipo de projeto
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddingTitlePhaseId(null)} leftIcon={<X size={12} />}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {orphanInPhase.length > 0 && (
                    <div
                      className="card"
                      style={{
                        padding: 12,
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="text-sm font-semibold mb-1">
                        Tarefas na fase sem tipo ({orphanInPhase.length})
                      </div>
                      <p className="text-xs text-muted mb-3">
                        Estas tarefas estão na fase (por exemplo criadas na página geral de tarefas), mas
                        ainda não estão em SAA/SES. Escolha o tipo para vincular — as concluídas passam a
                        aparecer normalmente no card do tipo.
                      </p>
                      {phaseTitles.length === 0 ? (
                        <p className="text-sm text-muted">
                          Adicione primeiro um <strong>Tipo de projeto</strong> no cabeçalho desta fase.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {orphanInPhase.map((task) => (
                            <div
                              key={task.id}
                              className="flex flex-wrap items-end gap-3"
                              style={{
                                padding: "10px 12px",
                                borderRadius: 8,
                                border: "1px solid var(--border)",
                                background: "var(--surface)",
                              }}
                            >
                              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                                <div className="text-sm font-medium truncate">{task.title}</div>
                                <div className="mt-1 flex flex-wrap gap-2 items-center">
                                  {statusBadge(task.status)}
                                  {task.completion_date && (
                                    <span className="text-xs text-muted">
                                      Concluída em {formatDate(task.completion_date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div style={{ minWidth: 220 }}>
                                <Field label="Vincular ao tipo">
                                  <Select
                                    value=""
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      if (v) void handleLinkOrphanToTitle(task, v);
                                    }}
                                  >
                                    <option value="">Escolher…</option>
                                    {phaseTitles.map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {phaseTitles.length === 0 ? (
                    <EmptyState
                      icon={<Layers size={22} />}
                      title="Nenhum tipo de projeto nesta fase"
                      description='Use o botão "Tipo de projeto" acima para adicionar SAA ou SES. Enquanto não houver tipo, a estrutura Fase → Tipo → Tarefas fica vazia nesta etapa.'
                    />
                  ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(320px, 360px))",
                      gap: 14,
                      alignItems: "start",
                      justifyContent: "start",
                    }}
                  >
                    {phaseTitles.map((title) => {
                      const titleTasks = tasksByTitle.get(title.id) || [];
                      const titleCollapsed = !!collapsedTitles[title.id];
                      return (
                        <div
                          key={title.id}
                          className="card"
                          style={{
                            width: "100%",
                            overflow: "hidden",
                            background: "var(--surface)",
                            border: "1px solid #334155",
                            borderRadius: "var(--radius-lg)",
                            boxShadow: "0 10px 24px rgba(2, 6, 23, 0.35)",
                          }}
                        >
                        <div
                          style={{
                            padding: "12px 14px",
                            borderBottom: titleCollapsed ? "none" : "1px solid var(--border)",
                            background: "linear-gradient(180deg, rgba(37,99,235,0.10) 0%, rgba(2,6,23,0.00) 100%)",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsedTitles((prev) => ({ ...prev, [title.id]: !prev[title.id] }))
                            }
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                          >
                            {titleCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          </button>
                          {editingTitleId === title.id ? (
                            <>
                              <Input
                                value={editingTitleName}
                                onChange={(event) => setEditingTitleName(event.target.value)}
                                style={{ flex: 1 }}
                              />
                              <Button
                                size="icon-sm"
                                onClick={async () => {
                                  await updatePhaseTitle(title.id, { name: editingTitleName.trim() });
                                  setEditingTitleId(null);
                                  await loadAll();
                                }}
                              >
                                <Save size={12} />
                              </Button>
                              <Button size="icon-sm" variant="ghost" onClick={() => setEditingTitleId(null)}>
                                <X size={12} />
                              </Button>
                            </>
                          ) : (
                            <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 0 }}>
                              <div className="flex items-center justify-between gap-2">
                                <strong style={{ minWidth: 0 }}>{title.name}</strong>
                                <Badge variant="neutral">{titleTasks.length} tarefa(s)</Badge>
                              </div>
                              <Badge variant="primary">{title.name}</Badge>
                              <div className="flex items-center gap-1 flex-wrap">
                                <Button size="icon-sm" variant="ghost" onClick={() => moveTitle(title.id, "up")}>
                                  <ChevronUp size={13} />
                                </Button>
                                <Button size="icon-sm" variant="ghost" onClick={() => moveTitle(title.id, "down")}>
                                  <ChevronDown size={13} />
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingTitleId(title.id);
                                    setEditingTitleName(title.name);
                                  }}
                                >
                                  <Pencil size={12} />
                                </Button>
                                <Button size="icon-sm" variant="danger-ghost" onClick={() => handleDeleteTitle(title.id)}>
                                  <Trash2 size={12} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  leftIcon={<Plus size={12} />}
                                  onClick={() => {
                                    setAddingTaskTitleId(title.id);
                                    setTaskForm({ ...DEFAULT_TASK_FORM, start_date: getTodayLocalISO() });
                                  }}
                                >
                                  Tarefa
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        {!titleCollapsed && (
                          <div style={{ padding: 12 }} className="flex flex-col gap-2">
                            {addingTaskTitleId === title.id && (
                              <div className="card" style={{ padding: 10 }}>
                                <TaskForm
                                  users={users}
                                  form={taskForm}
                                  onChange={setTaskForm}
                                  onSubmit={() => handleCreateTask(title.id)}
                                  onCancel={resetTaskForm}
                                  submitText="Criar tarefa"
                                  canEditStartDate={false}
                                  createMode
                                />
                              </div>
                            )}

                            {titleTasks.length === 0 && (
                              <p className="text-sm text-muted">Sem tarefas neste tipo de projeto.</p>
                            )}

                            {titleTasks.map((task, taskIndex) => {
                              const assignedUser = users.find((user) => user.id === task.assigned_to);
                              const isEditingTask = editingTaskId === task.id;
                              const isExpandedTask = expandedTaskId === task.id;
                              const journalCount = journalCounts.get(task.id) || 0;
                              return (
                                <div key={task.id} className="card" style={{ overflow: "hidden" }}>
                                  {isEditingTask ? (
                                    <div style={{ padding: 10 }}>
                                      <TaskForm
                                        users={users}
                                        form={editingTaskForm}
                                        onChange={setEditingTaskForm}
                                        onSubmit={() => saveTaskEdit(task)}
                                        onCancel={() => setEditingTaskId(null)}
                                        submitText="Salvar alterações"
                                        canEditStartDate={canEditStartDate}
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      <div
                                        style={{
                                          padding: "10px 12px",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => setExpandedTaskId(isExpandedTask ? null : task.id)}
                                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                                        >
                                          {isExpandedTask ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                        <Badge variant="neutral">#{taskIndex + 1}</Badge>
                                        <strong style={{ flex: 1, minWidth: 180 }}>{task.title}</strong>
                                        {statusBadge(task.status)}
                                        {priorityBadge(task.priority)}
                                        {journalCount > 0 && (
                                          <Badge variant="neutral">
                                            <BookOpen size={10} style={{ marginRight: 2 }} />
                                            {journalCount}
                                          </Badge>
                                        )}
                                        <Button size="icon-sm" variant="ghost" onClick={() => moveTask(task, "up")}>
                                          <ArrowUp size={12} />
                                        </Button>
                                        <Button size="icon-sm" variant="ghost" onClick={() => moveTask(task, "down")}>
                                          <ArrowDown size={12} />
                                        </Button>
                                        <Button size="icon-sm" variant="ghost" onClick={() => startEditTask(task)}>
                                          <Pencil size={12} />
                                        </Button>
                                        <Button size="icon-sm" variant="danger-ghost" onClick={() => handleDeleteTask(task.id)}>
                                          <Trash2 size={12} />
                                        </Button>
                                      </div>
                                      <div
                                        style={{
                                          borderTop: "1px solid var(--border)",
                                          padding: "8px 12px",
                                          display: "flex",
                                          gap: 14,
                                          flexWrap: "wrap",
                                          fontSize: 12,
                                          color: "var(--muted-fg)",
                                        }}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          <User size={12} />
                                          {assignedUser?.name || "Sem responsável"}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <CalendarClock size={12} />
                                          Prazo: {task.planned_due_date ? formatDate(task.planned_due_date) : "—"}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <Flag size={12} />
                                          Início: {task.start_date ? formatDate(task.start_date) : "—"}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <CheckSquare size={12} />
                                          Conclusão: {task.completion_date ? formatDate(task.completion_date) : "—"}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <MessageSquare size={12} />
                                          Comentários: {task.comments ? "sim" : "não"}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                          <Paperclip size={12} />
                                          Anexos: {task.attachments?.length || 0}
                                        </span>
                                      </div>
                                      {isExpandedTask && (
                                        <TaskJournalInline
                                          taskId={task.id}
                                          projectId={projectId}
                                          phaseId={task.phase_id}
                                          users={users}
                                          onChanged={loadAll}
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TaskForm({
  users,
  form,
  onChange,
  onSubmit,
  onCancel,
  submitText,
  canEditStartDate,
  createMode = false,
}: {
  users: SimpleUser[];
  form: TaskFormState;
  onChange: (next: TaskFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitText: string;
  canEditStartDate: boolean;
  createMode?: boolean;
}) {
  function patch<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  const startBase = form.start_date || getTodayLocalISO();
  const estimatedDays = form.planned_due_date
    ? countBusinessDaysInclusive(startBase, form.planned_due_date)
    : 0;

  function patchEstimatedDays(value: string) {
    const computed = dueDateFromBusinessDays(startBase, Number(value));
    patch("planned_due_date", computed || "");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid-2">
        <Field label="Nome da tarefa">
          <Input value={form.title} onChange={(event) => patch("title", event.target.value)} />
        </Field>
        <Field label="Responsável">
          <Select value={form.assigned_to} onChange={(event) => patch("assigned_to", event.target.value)}>
            <option value="">Sem responsável</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Descrição">
        <Textarea
          value={form.description}
          onChange={(event) => patch("description", event.target.value)}
          placeholder="Escopo técnico, premissas e observações."
        />
      </Field>

      <div className="grid-3">
        <Field label="Dias previstos (8h/dia)">
          <Input
            type="number"
            min={1}
            step={1}
            value={estimatedDays > 0 ? String(estimatedDays) : ""}
            onChange={(event) => patchEstimatedDays(event.target.value)}
          />
        </Field>
        <Field label="Status">
          <Select value={form.status} onChange={(event) => patch("status", event.target.value)}>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em andamento</option>
            <option value="completed">Concluída</option>
          </Select>
        </Field>
        <Field label="Prioridade">
          <Select
            value={form.priority}
            onChange={(event) => patch("priority", event.target.value as TaskFormState["priority"])}
          >
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
            <option value="critical">Crítica</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Data de início"
        help={
          createMode
            ? "Definida automaticamente no dia da criação."
            : canEditStartDate
            ? "Ajustável por líder/coordenador."
            : "Somente líder/coordenador pode alterar."
        }
      >
        <Input
          type="date"
          value={form.start_date}
          onChange={(event) => patch("start_date", event.target.value)}
          disabled={createMode || !canEditStartDate}
        />
      </Field>

      <Field label="Comentários">
        <Textarea
          value={form.comments}
          onChange={(event) => patch("comments", event.target.value)}
          placeholder="Decisões técnicas, riscos, observações de revisão."
        />
      </Field>

      <Field label="Anexos (um link por linha)">
        <Textarea
          value={form.attachmentsText}
          onChange={(event) => patch("attachmentsText", event.target.value)}
          placeholder="https://.../memorial.pdf"
        />
      </Field>

      <div className="flex gap-2">
        <Button onClick={onSubmit} leftIcon={<Save size={13} />} disabled={!form.title.trim()}>
          {submitText}
        </Button>
        <Button onClick={onCancel} variant="ghost" leftIcon={<X size={13} />}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
