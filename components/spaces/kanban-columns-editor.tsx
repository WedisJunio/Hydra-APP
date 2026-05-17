"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Code2, GripVertical } from "lucide-react";

import type { KanbanColumnDef } from "@/lib/workspaces/spaces-shared";
import { parseKanbanColumns, DEFAULT_KANBAN_COLUMNS, slugKey } from "@/lib/workspaces/spaces-shared";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

// ─── Color presets ────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  "#6366f1", "#2563eb", "#0d9488", "#16a34a",
  "#d97706", "#ea580c", "#dc2626", "#c026d3",
  "#64748b", "#94a3b8",
];

// ─── Inline color popover ─────────────────────────────────────────────────────

function ColorPopover({ color, disabled, onChange }: {
  color: string;
  disabled?: boolean;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Swatch button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Escolher cor"
        style={{
          width: 28, height: 28, borderRadius: 8,
          background: color,
          border: open ? "2px solid var(--foreground)" : "2px solid var(--border)",
          cursor: disabled ? "default" : "pointer",
          flexShrink: 0,
          transition: "border-color 0.1s",
          boxShadow: open ? "0 0 0 3px color-mix(in srgb,var(--primary) 20%,transparent)" : "none",
        }}
      />

      {/* Popover */}
      {open && !disabled && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 100,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0,0,0,.2)",
          padding: 10,
          minWidth: 150,
        }}>
          {/* Presets grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, marginBottom: 8 }}>
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: c,
                  border: color === c ? "2px solid var(--foreground)" : "2px solid transparent",
                  cursor: "pointer", padding: 0,
                  transition: "transform 0.1s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.15)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              />
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", marginBottom: 8 }} />

          {/* Custom color */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: color, border: "2px solid var(--border)", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: "var(--muted-fg)", fontFamily: "monospace", flex: 1 }}>{color}</span>
            <input
              ref={nativeRef}
              type="color"
              value={color}
              onChange={(e) => onChange(e.target.value)}
              style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", padding: 1, background: "none" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  valueRaw: unknown;
  podeEditar: boolean;
  onSave: (cols: KanbanColumnDef[]) => void;
};

export function KanbanColumnsEditor({ valueRaw, podeEditar, onSave }: Props) {
  const [cols, setCols] = useState<KanbanColumnDef[]>(() => parseKanbanColumns(valueRaw));
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");

  useEffect(() => { setCols(parseKanbanColumns(valueRaw)); }, [valueRaw]);

  function takenKeys(exceptIndex?: number): Set<string> {
    const s = new Set<string>();
    cols.forEach((c, i) => { if (i !== exceptIndex) s.add(c.key); });
    return s;
  }

  function addColumn() {
    const t = takenKeys();
    const label = "Nova coluna";
    const key = slugKey(label, t);
    setCols((prev) => [...prev, { key, label, color: COLOR_PRESETS[prev.length % COLOR_PRESETS.length] }]);
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

  function updateKey(i: number, rawKey: string) {
    const k = rawKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_|_$/g, "") || "col";
    if (takenKeys(i).has(k)) {
      showErrorToast("Chave duplicada", "Use outra chave interna.");
      return;
    }
    setCols((prev) => prev.map((c, j) => (j === i ? { ...c, key: k } : c)));
  }

  function persist() {
    if (cols.length === 0) { showErrorToast("Colunas vazias", "Defina ao menos uma coluna."); return; }
    const empty = cols.find((c) => !c.label.trim());
    if (empty) { showErrorToast("Nome obrigatório", "Preencha o título de cada coluna."); return; }
    onSave(cols);
    showSuccessToast("Colunas salvas", "");
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
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        marginBottom: 14,
      }}>
        {podeEditar && (
          <>
            <Button size="sm" leftIcon={<Plus size={13} />} onClick={addColumn}>
              Adicionar coluna
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setCols(DEFAULT_KANBAN_COLUMNS);
                onSave(DEFAULT_KANBAN_COLUMNS);
                showSuccessToast("Padrão restaurado", "");
              }}
            >
              Padrão COPASA
            </Button>
          </>
        )}
        <span style={{ fontSize: 11, color: "var(--muted-fg)", marginLeft: "auto" }}>
          {cols.length} coluna{cols.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Column header labels ─────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "28px 28px 1fr 120px 70px",
        gap: 8, alignItems: "center",
        padding: "0 4px 6px",
        borderBottom: "1px solid var(--border)",
        marginBottom: 6,
      }}>
        <div />
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cor</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Título exibido</div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Chave interna</div>
        <div />
      </div>

      {/* ── Column rows ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {cols.map((col, i) => (
          <div
            key={`${col.key}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 28px 1fr 120px 70px",
              gap: 8, alignItems: "center",
              padding: "6px 4px",
              borderRadius: 8,
              background: "var(--surface-2)",
              border: "1px solid color-mix(in srgb,var(--border) 60%,transparent)",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
          >
            {/* Drag handle (visual only) */}
            <div style={{ display: "flex", justifyContent: "center", opacity: 0.3 }}>
              <GripVertical size={14} style={{ color: "var(--muted-fg)" }} />
            </div>

            {/* Color picker popover */}
            <ColorPopover
              color={col.color ?? "#6366f1"}
              disabled={!podeEditar}
              onChange={(c) => updateColor(i, c)}
            />

            {/* Title input */}
            <input
              value={col.label}
              onChange={(e) => updateLabel(i, e.target.value)}
              disabled={!podeEditar}
              placeholder="Nome da coluna"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--foreground)",
                outline: "none",
                width: "100%",
                minWidth: 0,
                borderLeft: `3px solid ${col.color ?? "#6366f1"}`,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.borderLeftColor = col.color ?? "#6366f1"; }}
            />

            {/* Key input */}
            <input
              value={col.key}
              onChange={(e) => updateKey(i, e.target.value)}
              disabled={!podeEditar}
              placeholder="chave_interna"
              title="Chave interna — não mude após usar em cartões"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "5px 8px",
                fontSize: 10,
                fontFamily: "monospace",
                color: "var(--muted-fg)",
                outline: "none",
                width: "100%",
                minWidth: 0,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />

            {/* Actions */}
            {podeEditar ? (
              <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => moveColumn(i, -1)}
                  disabled={i === 0}
                  title="Subir"
                  style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", color: "var(--muted-fg)", opacity: i === 0 ? 0.3 : 1, padding: "3px 4px", borderRadius: 4, display: "flex" }}
                  onMouseEnter={(e) => { if (i > 0) e.currentTarget.style.background = "var(--surface-3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(i, 1)}
                  disabled={i === cols.length - 1}
                  title="Descer"
                  style={{ background: "none", border: "none", cursor: i === cols.length - 1 ? "default" : "pointer", color: "var(--muted-fg)", opacity: i === cols.length - 1 ? 0.3 : 1, padding: "3px 4px", borderRadius: 4, display: "flex" }}
                  onMouseEnter={(e) => { if (i < cols.length - 1) e.currentTarget.style.background = "var(--surface-3)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => removeColumn(i)}
                  title="Remover"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "3px 4px", borderRadius: 4, display: "flex" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ) : <div />}
          </div>
        ))}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {podeEditar && (
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button onClick={persist}>
            Salvar colunas
          </Button>
          <button
            type="button"
            onClick={() => {
              setJsonDraft(JSON.stringify(cols, null, 2));
              setShowJson((v) => !v);
            }}
            style={{
              fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: 7,
              background: showJson ? "var(--surface-3)" : "none",
              color: "var(--muted-fg)", border: "1px solid var(--border)", cursor: "pointer",
            }}
          >
            <Code2 size={13} />
            {showJson ? "Fechar JSON" : "JSON"}
          </button>
        </div>
      )}

      {/* ── JSON panel ──────────────────────────────────────────────── */}
      {showJson && podeEditar && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <Textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            rows={7}
            className="font-mono text-xs"
          />
          <div style={{ display: "flex", gap: 8 }}>
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
