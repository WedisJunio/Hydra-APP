"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  X,
  GripVertical,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ProjectPhase } from "@/lib/saneamento/types";
import {
  phaseStatusLabel,
  phaseStatusVariant,
} from "@/lib/saneamento/phases";
import {
  createPhase,
  renamePhase,
  deletePhase,
  rewritePhaseOrders,
} from "@/lib/saneamento/data";

type Props = {
  projectId: string;
  phases: ProjectPhase[];
  taskCountsByPhase: Map<string, number>;
  onChanged: () => void | Promise<void>;
};

export function PhasesEditor({
  projectId,
  phases,
  taskCountsByPhase,
  onChanged,
}: Props) {
  const sorted = useMemo(
    () => [...phases].sort((a, b) => a.order - b.order),
    [phases]
  );

  const [busy, setBusy] = useState(false);

  // edição inline de nome
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // adição
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // ─── helpers ───────────────────────────────────────────────────────────

  async function handleAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    setAdding(true);
    const ok = await createPhase({
      projectId,
      name: newName.trim(),
      order: sorted.length,
    });
    setNewName("");
    setAdding(false);
    setBusy(false);
    if (!ok) {
      alert("Erro ao adicionar etapa.");
      return;
    }
    await onChanged();
  }

  function startRename(phase: ProjectPhase) {
    setEditingId(phase.id);
    setEditingName(phase.name);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  async function commitRename(phaseId: string) {
    const name = editingName.trim();
    if (!name) {
      cancelRename();
      return;
    }
    setBusy(true);
    await renamePhase(phaseId, name);
    setBusy(false);
    cancelRename();
    await onChanged();
  }

  async function handleDelete(phase: ProjectPhase) {
    const taskCount = taskCountsByPhase.get(phase.id) || 0;
    const msg =
      taskCount > 0
        ? `Excluir a etapa "${phase.name}"? ${taskCount} tarefa${
            taskCount === 1 ? "" : "s"
          } associada${taskCount === 1 ? "" : "s"} ficará${
            taskCount === 1 ? "" : "ão"
          } sem etapa (a tarefa em si NÃO é excluída).`
        : `Excluir a etapa "${phase.name}"?`;

    if (!window.confirm(msg)) return;
    setBusy(true);
    await deletePhase(phase.id);
    await rewritePhaseOrders(sorted.filter((p) => p.id !== phase.id));
    setBusy(false);
    await onChanged();
  }

  async function move(phaseId: string, direction: "up" | "down") {
    const idx = sorted.findIndex((p) => p.id === phaseId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;

    const target = direction === "up" ? idx - 1 : idx + 1;
    const next = [...sorted];
    [next[idx], next[target]] = [next[target], next[idx]];

    setBusy(true);
    await rewritePhaseOrders(next);
    setBusy(false);
    await onChanged();
  }

  // ─── render ────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3">
      <div
        style={{
          padding: "10px 12px",
          background: "var(--info-soft)",
          border: "1px solid #BAE6FD",
          borderRadius: "var(--radius-md)",
          color: "var(--info-fg)",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <AlertTriangle size={14} />
        <span>
          Edite os nomes, reordene ou exclua etapas. Excluir uma etapa não
          remove tarefas — elas só perdem o vínculo.
        </span>
      </div>

      {/* Lista editável */}
      <div className="flex flex-col gap-2">
        {sorted.length === 0 && (
          <p className="text-sm text-muted">
            Nenhuma etapa cadastrada. Adicione abaixo.
          </p>
        )}

        {sorted.map((phase, idx) => {
          const isEditingThis = editingId === phase.id;
          const taskCount = taskCountsByPhase.get(phase.id) || 0;

          return (
            <div
              key={phase.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {/* Drag handle (visual; reordenação é pelos botões) */}
              <GripVertical size={14} style={{ color: "var(--subtle-fg)" }} />

              {/* Número da etapa */}
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: "var(--primary-soft)",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {idx + 1}
              </div>

              {/* Nome (edit ou view) */}
              <div className="flex-1 min-w-0">
                {isEditingThis ? (
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitRename(phase.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(phase.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    style={{ padding: "6px 10px" }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startRename(phase)}
                    style={{
                      background: "transparent",
                      borderTop: "none",
                      borderRight: "none",
                      borderBottom: "none",
                      borderLeft: "none",
                      padding: 0,
                      cursor: "text",
                      textAlign: "left",
                      width: "100%",
                      color: "var(--foreground)",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                    title="Clique para renomear"
                  >
                    {phase.name}
                  </button>
                )}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted flex-wrap">
                  <Badge variant={phaseStatusVariant[phase.status]}>
                    {phaseStatusLabel[phase.status]}
                  </Badge>
                  {taskCount > 0 && (
                    <span>
                      {taskCount} tarefa{taskCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => move(phase.id, "up")}
                  disabled={busy || idx === 0}
                  title="Mover para cima"
                >
                  <ChevronUp size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => move(phase.id, "down")}
                  disabled={busy || idx === sorted.length - 1}
                  title="Mover para baixo"
                >
                  <ChevronDown size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="danger-ghost"
                  onClick={() => handleDelete(phase)}
                  disabled={busy}
                  title="Excluir etapa"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Adicionar nova */}
      <div
        style={{
          padding: 12,
          background: "var(--surface-2)",
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          gap: 8,
          alignItems: "flex-end",
        }}
      >
        <Field label="Nome da nova etapa" className="flex-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex.: Compatibilização com hidrossanitário"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) handleAdd();
            }}
          />
        </Field>
        <Button
          onClick={handleAdd}
          loading={adding}
          disabled={!newName.trim() || busy}
          leftIcon={<Plus size={14} />}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}
