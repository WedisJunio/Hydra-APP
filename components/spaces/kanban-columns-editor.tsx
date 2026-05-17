"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Code2 } from "lucide-react";

import type { KanbanColumnDef } from "@/lib/workspaces/spaces-shared";
import { parseKanbanColumns, DEFAULT_KANBAN_COLUMNS, slugKey } from "@/lib/workspaces/spaces-shared";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";

const COLOR_PRESETS = [
  "#6366f1", "#2563eb", "#0d9488", "#16a34a",
  "#d97706", "#ea580c", "#dc2626", "#c026d3",
  "#64748b", "#94a3b8",
];

type Props = {
  valueRaw: unknown;
  podeEditar: boolean;
  onSave: (cols: KanbanColumnDef[]) => void;
};

export function KanbanColumnsEditor({ valueRaw, podeEditar, onSave }: Props) {
  const [cols, setCols] = useState<KanbanColumnDef[]>(() => parseKanbanColumns(valueRaw));
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const colorPickerRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    setCols(parseKanbanColumns(valueRaw));
  }, [valueRaw]);

  function takenKeys(exceptIndex?: number): Set<string> {
    const s = new Set<string>();
    cols.forEach((c, i) => {
      if (i !== exceptIndex) s.add(c.key);
    });
    return s;
  }

  function addColumn() {
    const t = takenKeys();
    const label = "Nova coluna";
    const key = slugKey(label, t);
    setCols((prev) => [...prev, { key, label }]);
  }

  function removeColumn(i: number) {
    if (cols.length <= 1) {
      showErrorToast("Mínimo de uma coluna", "Adicione outra antes de remover.");
      return;
    }
    setCols((prev) => prev.filter((_, j) => j !== i));
  }

  function moveColumn(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= cols.length) return;
    setCols((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function updateLabel(i: number, label: string) {
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, label } : c)));
  }

  function updateColor(i: number, color: string) {
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, color } : c)));
  }

  function updateKey(i: number, key: string) {
    const k = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_|_$/g, "") || "col";
    if (takenKeys(i).has(k)) {
      showErrorToast("Chave duplicada", "Use outra chave interna.");
      return;
    }
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, key: k } : c)));
  }

  function persist() {
    if (cols.length === 0) {
      showErrorToast("Colunas vazias", "Defina ao menos uma coluna.");
      return;
    }
    const empty = cols.find((c) => !c.label.trim());
    if (empty) {
      showErrorToast("Nome obrigatório", "Preencha o título de cada coluna.");
      return;
    }
    onSave(cols);
    showSuccessToast("Colunas do quadro salvas", "");
  }

  function applyJsonImport() {
    try {
      const parsed = JSON.parse(jsonDraft) as unknown;
      const next = parseKanbanColumns(parsed);
      if (next.length === 0) throw new Error("empty");
      setCols(next);
      onSave(next);
      showSuccessToast("Importado", "Colunas atualizadas a partir do JSON.");
      setShowJson(false);
    } catch {
      showErrorToast("JSON inválido", "Use um array [{ \"key\", \"label\" }, ...].");
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: "1px solid var(--border)",
        background: "linear-gradient(165deg, color-mix(in srgb, var(--primary) 6%, var(--surface)) 0%, var(--surface) 48%)",
      }}
    >
      <div className="px-3 py-2.5 flex items-center justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Colunas do quadro</span>
        {podeEditar && (
          <div className="flex gap-1 flex-wrap justify-end">
            <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={addColumn}>
              Coluna
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCols(DEFAULT_KANBAN_COLUMNS);
                onSave(DEFAULT_KANBAN_COLUMNS);
                showSuccessToast("Padrão restaurado", "Três colunas clássicas aplicadas.");
              }}
            >
              Padrão Copasa
            </Button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {cols.map((col, i) => (
          <div
            key={`${col.key}-${i}`}
            className="flex flex-wrap gap-2 items-end p-3 rounded-lg"
            style={{
              background: "var(--surface)",
              border: "1px solid color-mix(in srgb, var(--border) 80%, transparent)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {/* Color strip */}
            <div
              className="w-1 self-stretch rounded-full shrink-0"
              style={{ background: col.color ?? `color-mix(in srgb, var(--primary) ${40 + (i % 4) * 15}%, var(--surface-3))`, minHeight: 44 }}
            />

            {/* Color picker */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Cor</span>
              <button
                type="button"
                disabled={!podeEditar}
                onClick={() => colorPickerRefs.current[i]?.click()}
                style={{ width: 28, height: 28, borderRadius: 6, background: col.color ?? "#6366f1", border: "2px solid var(--border)", cursor: podeEditar ? "pointer" : "default", flexShrink: 0 }}
                title="Escolher cor"
              />
              <input
                ref={(el) => { colorPickerRefs.current[i] = el; }}
                type="color"
                value={col.color ?? "#6366f1"}
                onChange={(e) => updateColor(i, e.target.value)}
                disabled={!podeEditar}
                style={{ width: 0, height: 0, opacity: 0, position: "absolute", pointerEvents: "none" }}
              />
              {/* Quick presets */}
              {podeEditar && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 2, width: 62 }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateColor(i, c)}
                      style={{ width: 12, height: 12, borderRadius: 3, background: c, border: col.color === c ? "2px solid var(--foreground)" : "1px solid transparent", cursor: "pointer", padding: 0 }}
                    />
                  ))}
                </div>
              )}
            </div>

            <Field label="Título exibido" className="flex-1 min-w-[140px] mb-0">
              <Input
                value={col.label}
                onChange={(e) => updateLabel(i, e.target.value)}
                disabled={!podeEditar}
                placeholder="Ex.: Aguardando documentos"
              />
            </Field>
            <Field
              label="Chave interna"
              className="w-[130px] mb-0"
              help="Não mude após usar em cartões."
            >
              <Input
                value={col.key}
                onChange={(e) => updateKey(i, e.target.value)}
                disabled={!podeEditar}
                className="font-mono text-xs"
              />
            </Field>
            {podeEditar && (
              <div className="flex gap-0.5 pb-0.5">
                <Button size="icon-sm" variant="ghost" title="Subir" onClick={() => moveColumn(i, -1)}>
                  <ArrowUp size={14} />
                </Button>
                <Button size="icon-sm" variant="ghost" title="Descer" onClick={() => moveColumn(i, 1)}>
                  <ArrowDown size={14} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="danger-ghost"
                  title="Remover coluna"
                  onClick={() => removeColumn(i)}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {podeEditar && (
        <div className="px-3 pb-3 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <Button size="sm" onClick={persist}>
            Salvar colunas
          </Button>
          <button
            type="button"
            className="text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-md"
            style={{ color: "var(--muted-fg)", background: "var(--surface-2)" }}
            onClick={() => {
              setJsonDraft(JSON.stringify(cols, null, 2));
              setShowJson((v) => !v);
            }}
          >
            <Code2 size={14} />
            {showJson ? "Fechar JSON" : "Importar / exportar JSON"}
          </button>
        </div>
      )}

      {showJson && podeEditar && (
        <div className="px-3 pb-3">
          <Textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            rows={6}
            className="font-mono text-xs"
          />
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="secondary" onClick={() => setJsonDraft(JSON.stringify(cols, null, 2))}>
              Copiar estado atual
            </Button>
            <Button size="sm" onClick={applyJsonImport}>
              Aplicar JSON
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
