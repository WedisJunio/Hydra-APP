"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, Trash2, BookOpen } from "lucide-react";

import { getCurrentProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  JournalCategory,
  JournalEntry,
} from "@/lib/saneamento/types";
import {
  journalCategoryLabel,
  journalCategoryVariant,
} from "@/lib/saneamento/types";
import {
  listTaskJournal,
  createJournalEntry,
  deleteJournalEntry,
} from "@/lib/saneamento/data";

type SimpleUser = { id: string; name: string };

type Props = {
  taskId: string;
  projectId: string;
  phaseId: string | null;
  users: SimpleUser[];
  onChanged?: () => void;
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

function categoryRailColor(c: JournalCategory) {
  switch (c) {
    case "bloqueio":
      return "var(--danger)";
    case "diligencia":
      return "var(--warning)";
    case "progresso":
      return "var(--success)";
    case "reuniao":
    case "visita":
      return "var(--info)";
    case "comunicacao":
      return "var(--primary)";
    default:
      return "var(--border-strong)";
  }
}

export function TaskJournalInline({
  taskId,
  projectId,
  phaseId,
  users,
  onChanged,
}: Props) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<JournalCategory>("progresso");
  const [content, setContent] = useState("");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const list = await listTaskJournal(taskId);
    setEntries(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [taskId]);

  async function handleAdd() {
    if (!content.trim()) return;
    const profile = await getCurrentProfile();
    if (!profile) {
      alert("Usuário não autenticado.");
      return;
    }
    setSaving(true);
    const result = await createJournalEntry({
      project_id: projectId,
      task_id: taskId,
      phase_id: phaseId,
      author_id: profile.id,
      entry_date: date,
      category,
      content: content.trim(),
      hours_worked: hours ? Number(hours) : null,
    });
    setSaving(false);
    if (!result.ok) {
      alert("Erro ao salvar: " + (result.error ?? ""));
      return;
    }
    setContent("");
    setHours("");
    setCategory("progresso");
    setDate(todayISO());
    await load();
    onChanged?.();
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este registro?")) return;
    await deleteJournalEntry(id);
    await load();
    onChanged?.();
  }

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users]
  );

  return (
    <div
      style={{
        background: "var(--surface-2)",
        borderTop: "1px solid var(--border)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div className="flex items-center gap-2">
        <BookOpen size={14} className="text-muted" />
        <span className="text-sm font-semibold">Diário desta tarefa</span>
        <span className="text-xs text-muted">
          ({entries.length} registro{entries.length === 1 ? "" : "s"})
        </span>
      </div>

      {/* Lista de entradas */}
      {loading ? (
        <Skeleton style={{ height: 60 }} />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Nenhum registro ainda. Use o formulário abaixo pra explicar avanços,
          bloqueios ou marcos desta tarefa.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const author = userById.get(entry.author_id || "");
            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div
                  style={{
                    width: 3,
                    flexShrink: 0,
                    borderRadius: 999,
                    background: categoryRailColor(entry.category),
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={journalCategoryVariant[entry.category]} dot>
                      {journalCategoryLabel[entry.category]}
                    </Badge>
                    <span className="text-xs text-muted">
                      {new Date(entry.entry_date + "T00:00:00").toLocaleDateString(
                        "pt-BR"
                      )}
                    </span>
                    {entry.hours_worked != null && (
                      <Badge variant="neutral">
                        {Number(entry.hours_worked)}h
                      </Badge>
                    )}
                  </div>
                  <p
                    className="text-sm"
                    style={{
                      margin: 0,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.content}
                  </p>
                  {author && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted">
                      <Avatar name={author.name} size="sm" />
                      {author.name}
                    </div>
                  )}
                </div>
                <Button
                  size="icon-sm"
                  variant="danger-ghost"
                  onClick={() => handleDelete(entry.id)}
                  title="Excluir"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Formulário rápido */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          <Field label="Data">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Categoria">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as JournalCategory)}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {journalCategoryLabel[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Horas (opcional)">
            <Input
              type="number"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Ex.: 4"
            />
          </Field>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="O que aconteceu nesta tarefa hoje? Avanço, bloqueio, motivo de atraso..."
          style={{ minHeight: 96 }}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleAdd}
            loading={saving}
            disabled={!content.trim()}
            leftIcon={<Send size={13} />}
          >
            Adicionar registro
          </Button>
        </div>
      </div>
    </div>
  );
}
