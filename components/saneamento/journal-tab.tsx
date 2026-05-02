"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Save,
  X,
  Pencil,
  Trash2,
  CalendarClock,
  TrendingUp,
  AlertOctagon,
  Clock,
  BookOpen,
  GitBranch,
  CheckSquare,
} from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import { showErrorToast } from "@/lib/toast";
import {
  listProjectJournal,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  listProjectTasks,
} from "@/lib/saneamento/data";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea, Select, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatsGrid } from "@/components/ui/stat";
import type {
  JournalCategory,
  JournalEntry,
  ProjectPhase,
} from "@/lib/saneamento/types";
import {
  journalCategoryLabel,
  journalCategoryDescription,
  journalCategoryVariant,
} from "@/lib/saneamento/types";

type SimpleUser = { id: string; name: string };
type SimpleTask = { id: string; title: string };

type Props = {
  projectId: string;
  users: SimpleUser[];
  phases: ProjectPhase[];
};

const CATEGORY_OPTIONS: JournalCategory[] = [
  "progresso",
  "bloqueio",
  "diligencia",
  "reuniao",
  "visita",
  "comunicacao",
  "outro",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLong(dateString: string) {
  return new Date(dateString + "T00:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatRelative(dateString: string) {
  const today = todayISO();
  if (dateString === today) return "Hoje";

  const target = new Date(dateString + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");
  const diffDays = Math.round(
    (todayDate.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 1) return "Ontem";
  if (diffDays > 0 && diffDays < 7) return `Há ${diffDays} dias`;
  return formatDateLong(dateString);
}

export function JournalTab({ projectId, users, phases }: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tasks, setTasks] = useState<SimpleTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [filterCategory, setFilterCategory] = useState<JournalCategory | "">("");
  const [filterAuthor, setFilterAuthor] = useState("");

  const sortedPhases = useMemo(
    () => [...phases].sort((a, b) => a.order - b.order),
    [phases]
  );

  // create form
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<JournalCategory>("progresso");
  const [taskId, setTaskId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [saving, setSaving] = useState(false);

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCategory, setEditCategory] = useState<JournalCategory>("progresso");
  const [editTaskId, setEditTaskId] = useState("");
  const [editPhaseId, setEditPhaseId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editHours, setEditHours] = useState("");

  async function load() {
    setLoading(true);
    const [entriesList, taskList] = await Promise.all([
      listProjectJournal(projectId),
      listProjectTasks(projectId),
    ]);
    setEntries(entriesList);
    setTasks(
      taskList.map((t) => ({ id: t.id, title: t.title })) as SimpleTask[]
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [projectId]);

  function resetForm() {
    setDate(todayISO());
    setCategory("progresso");
    setTaskId("");
    setPhaseId("");
    setTitle("");
    setContent("");
    setHoursWorked("");
  }

  async function handleCreate() {
    if (!content.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      showErrorToast("Usuário não autenticado.");
      return;
    }
    setSaving(true);
    const result = await createJournalEntry({
      project_id: projectId,
      task_id: taskId || null,
      phase_id: phaseId || null,
      author_id: profile.id,
      entry_date: date,
      category,
      title: title.trim() || null,
      content: content.trim(),
      hours_worked: hoursWorked ? Number(hoursWorked) : null,
    });
    setSaving(false);
    if (!result.ok) {
      showErrorToast("Erro ao salvar: " + (result.error ?? ""));
      return;
    }
    resetForm();
    setShowForm(false);
    await load();
  }

  function startEdit(entry: JournalEntry) {
    setEditingId(entry.id);
    setEditDate(entry.entry_date);
    setEditCategory(entry.category);
    setEditTaskId(entry.task_id || "");
    setEditPhaseId(entry.phase_id || "");
    setEditTitle(entry.title || "");
    setEditContent(entry.content);
    setEditHours(entry.hours_worked?.toString() || "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(entryId: string) {
    if (!editContent.trim()) return;
    await updateJournalEntry(entryId, {
      entry_date: editDate,
      category: editCategory,
      task_id: editTaskId || null,
      phase_id: editPhaseId || null,
      title: editTitle.trim() || null,
      content: editContent.trim(),
      hours_worked: editHours ? Number(editHours) : null,
    });
    setEditingId(null);
    await load();
  }

  async function handleDelete(entryId: string) {
    await deleteJournalEntry(entryId);
    setConfirmDeleteId(null);
    await load();
  }

  // Filtros
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterAuthor && e.author_id !== filterAuthor) return false;
      return true;
    });
  }, [entries, filterCategory, filterAuthor]);

  // Agrupar por data
  const grouped = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of filteredEntries) {
      if (!map.has(e.entry_date)) map.set(e.entry_date, []);
      map.get(e.entry_date)!.push(e);
    }
    return Array.from(map.entries());
  }, [filteredEntries]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const blockedThisMonth = entries.filter(
      (e) => e.category === "bloqueio" && e.entry_date >= monthStart
    ).length;
    const totalHours = entries.reduce(
      (s, e) => s + Number(e.hours_worked || 0),
      0
    );
    const lastEntry = entries[0];

    // dias bloqueados no mês: dias únicos com entrada de bloqueio
    const blockedDates = new Set(
      entries
        .filter((e) => e.category === "bloqueio" && e.entry_date >= monthStart)
        .map((e) => e.entry_date)
    );

    return {
      total: entries.length,
      blockedThisMonth,
      blockedDays: blockedDates.size,
      totalHours,
      lastDate: lastEntry?.entry_date,
    };
  }, [entries]);

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );
  const taskById = useMemo(
    () => new Map(tasks.map((t) => [t.id, t])),
    [tasks]
  );
  const phaseById = useMemo(
    () => new Map(phases.map((p) => [p.id, p])),
    [phases]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3
            className="text-lg font-bold m-0"
            style={{ letterSpacing: "-0.01em" }}
          >
            Diário do projeto
          </h3>
          <p className="text-sm text-muted mt-1">
            Registro do que aconteceu, quando e por quê. Sirva pra explicar
            atrasos, paradas e marcos importantes.
          </p>
        </div>
        <Button
          leftIcon={<Plus size={16} />}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Fechar" : "Nova entrada"}
        </Button>
      </div>

      <StatsGrid>
        <Stat
          label="Total de registros"
          value={stats.total}
          icon={<BookOpen size={14} />}
        />
        <Stat
          label="Bloqueios no mês"
          value={stats.blockedThisMonth}
          icon={<AlertOctagon size={14} />}
          trendVariant={stats.blockedThisMonth > 0 ? "down" : "up"}
          trend={
            stats.blockedDays > 0
              ? `${stats.blockedDays} dias com bloqueio`
              : "Nenhum bloqueio"
          }
        />
        <Stat
          label="Horas registradas"
          value={
            stats.totalHours > 0
              ? `${stats.totalHours.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`
              : "—"
          }
          icon={<Clock size={14} />}
        />
        <Stat
          label="Último registro"
          value={stats.lastDate ? formatRelative(stats.lastDate) : "Sem registros"}
          icon={<CalendarClock size={14} />}
        />
      </StatsGrid>

      {/* Filtros */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">Filtrar:</span>
          <Select
            value={filterCategory}
            onChange={(e) =>
              setFilterCategory(e.target.value as JournalCategory | "")
            }
            style={{ width: "auto", minWidth: 180 }}
          >
            <option value="">Todas as categorias</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {journalCategoryLabel[c]}
              </option>
            ))}
          </Select>
          <Select
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            style={{ width: "auto", minWidth: 180 }}
          >
            <option value="">Todos os autores</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          {(filterCategory || filterAuthor) && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<X size={12} />}
              onClick={() => {
                setFilterCategory("");
                setFilterAuthor("");
              }}
            >
              Limpar
            </Button>
          )}
          <span className="text-sm text-muted" style={{ marginLeft: "auto" }}>
            {filteredEntries.length} de {entries.length} entrada
            {entries.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      {/* Form de nova entrada */}
      {showForm && (
        <Card>
          <h4 className="text-md font-semibold mb-3">Nova entrada</h4>
          <div className="flex flex-col gap-3">
            <div className="grid-3">
              <Field label="Data do registro">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Categoria" help={journalCategoryDescription[category]}>
                <Select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as JournalCategory)
                  }
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {journalCategoryLabel[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Horas trabalhadas (opcional)">
                <Input
                  type="number"
                  step="0.25"
                  value={hoursWorked}
                  onChange={(e) => setHoursWorked(e.target.value)}
                  placeholder="Ex.: 4"
                />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Etapa relacionada (opcional)">
                <Select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                  <option value="">— Sem etapa —</option>
                  {sortedPhases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.order + 1}. {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tarefa relacionada (opcional)">
                <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">— Sem tarefa —</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Título (opcional)">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: COPASA pediu nova memória de cálculo"
              />
            </Field>

            <Field label="O que aconteceu">
              <Textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Descreva o ocorrido. Se for bloqueio, explique o motivo e o que está esperando."
                style={{ minHeight: 110 }}
              />
            </Field>

            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                loading={saving}
                disabled={!content.trim()}
                leftIcon={<Save size={14} />}
              >
                Salvar entrada
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de entradas */}
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton style={{ height: 100 }} />
          <Skeleton style={{ height: 100 }} />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="Diário vazio"
          description="Registre o que aconteceu hoje no projeto. Avanços, bloqueios, reuniões, diligências — tudo vira histórico pra explicar prazo e desempenho depois."
          action={
            <Button leftIcon={<Plus size={16} />} onClick={() => setShowForm(true)}>
              Primeira entrada
            </Button>
          }
        />
      ) : filteredEntries.length === 0 ? (
        <EmptyState
          title="Nada com esse filtro"
          description="Ajuste a categoria ou o autor pra ver mais registros."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setFilterCategory("");
                setFilterAuthor("");
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([date, dayEntries]) => (
            <div key={date}>
              {/* Cabeçalho do dia */}
              <div
                className="flex items-center gap-2 mb-2"
                style={{ marginLeft: 4 }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "var(--primary)",
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--foreground)",
                    textTransform: "capitalize",
                  }}
                >
                  {formatDateLong(date)}
                </span>
                <span className="text-xs text-muted">
                  · {formatRelative(date)} · {dayEntries.length} registro
                  {dayEntries.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {dayEntries.map((entry) => {
                  const isEditing = editingId === entry.id;
                  const author = userById.get(entry.author_id || "");
                  const linkedTask = entry.task_id
                    ? taskById.get(entry.task_id)
                    : null;
                  const linkedPhase = entry.phase_id
                    ? phaseById.get(entry.phase_id)
                    : null;

                  if (isEditing) {
                    return (
                      <Card key={entry.id}>
                        <div className="flex flex-col gap-3">
                          <div className="grid-3">
                            <Field label="Data">
                              <Input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                              />
                            </Field>
                            <Field label="Categoria">
                              <Select
                                value={editCategory}
                                onChange={(e) =>
                                  setEditCategory(
                                    e.target.value as JournalCategory
                                  )
                                }
                              >
                                {CATEGORY_OPTIONS.map((c) => (
                                  <option key={c} value={c}>
                                    {journalCategoryLabel[c]}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field label="Horas">
                              <Input
                                type="number"
                                step="0.25"
                                value={editHours}
                                onChange={(e) => setEditHours(e.target.value)}
                              />
                            </Field>
                          </div>
                          <div className="grid-2">
                            <Field label="Etapa">
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
                            </Field>
                            <Field label="Tarefa">
                              <Select
                                value={editTaskId}
                                onChange={(e) => setEditTaskId(e.target.value)}
                              >
                                <option value="">— Sem tarefa —</option>
                                {tasks.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.title}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                          <Field label="Título">
                            <Input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                          </Field>
                          <Field label="Descrição">
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              style={{ minHeight: 100 }}
                            />
                          </Field>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => saveEdit(entry.id)}
                              leftIcon={<Save size={13} />}
                            >
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  }

                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: 14,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        boxShadow: "var(--shadow-xs)",
                      }}
                    >
                      {/* Rail lateral colorida pela categoria */}
                      <div
                        style={{
                          width: 4,
                          flexShrink: 0,
                          borderRadius: 999,
                          background:
                            entry.category === "bloqueio"
                              ? "var(--danger)"
                              : entry.category === "diligencia"
                              ? "var(--warning)"
                              : entry.category === "progresso"
                              ? "var(--success)"
                              : entry.category === "reuniao" ||
                                entry.category === "visita"
                              ? "var(--info)"
                              : entry.category === "comunicacao"
                              ? "var(--primary)"
                              : "var(--border-strong)",
                        }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={journalCategoryVariant[entry.category]}
                              dot
                            >
                              {journalCategoryLabel[entry.category]}
                            </Badge>
                            {entry.hours_worked != null && (
                              <Badge variant="neutral">
                                <Clock size={10} style={{ marginRight: 2 }} />
                                {Number(entry.hours_worked)}h
                              </Badge>
                            )}
                            {linkedPhase && (
                              <Badge variant="primary">
                                <GitBranch
                                  size={10}
                                  style={{ marginRight: 2 }}
                                />
                                {linkedPhase.name}
                              </Badge>
                            )}
                            {linkedTask && (
                              <Badge variant="info">
                                <CheckSquare
                                  size={10}
                                  style={{ marginRight: 2 }}
                                />
                                {linkedTask.title.length > 30
                                  ? linkedTask.title.slice(0, 30) + "…"
                                  : linkedTask.title}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => startEdit(entry)}
                              title="Editar"
                            >
                              <Pencil size={12} />
                            </Button>
                            {confirmDeleteId === entry.id ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => handleDelete(entry.id)}
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
                                onClick={() => setConfirmDeleteId(entry.id)}
                                title="Excluir"
                              >
                                <Trash2 size={12} />
                              </Button>
                            )}
                          </div>
                        </div>

                        {entry.title && (
                          <h4
                            className="font-semibold mb-1"
                            style={{ fontSize: 15, color: "var(--foreground)" }}
                          >
                            {entry.title}
                          </h4>
                        )}

                        <p
                          className="text-sm"
                          style={{
                            color: "var(--foreground)",
                            lineHeight: 1.55,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {entry.content}
                        </p>

                        <div className="flex items-center gap-2 mt-3 text-xs text-muted">
                          {author && (
                            <span className="flex items-center gap-1">
                              <Avatar name={author.name} size="sm" />
                              {author.name}
                            </span>
                          )}
                          <span>·</span>
                          <span>
                            registrado em{" "}
                            {new Date(entry.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
