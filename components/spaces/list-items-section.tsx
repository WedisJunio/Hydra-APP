"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, LayoutList, LayoutGrid } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage, logSupabaseUnlessJwt } from "@/lib/supabase/errors";
import type {
  KanbanColumnDef,
  CustomFieldDef,
  WorkspaceViewMode,
} from "@/lib/workspaces/spaces-shared";
import { parseKanbanColumns, DEFAULT_KANBAN_COLUMNS } from "@/lib/workspaces/spaces-shared";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";

export type WorkspaceListItemRow = {
  id: string;
  list_node_id: string;
  title: string;
  status_key: string;
  sort_order: number;
  custom_values: Record<string, string | number | null>;
  created_at: string;
};

type Props = {
  listNodeId: string;
  enabled: boolean;
  defaultView: WorkspaceViewMode;
  /** Preferência só deste usuário (sobrescreve default da lista). */
  userViewMode: WorkspaceViewMode | null;
  onUserViewModeChange: (mode: WorkspaceViewMode) => void;
  kanbanColumnsRaw: unknown;
  customFieldDefs: CustomFieldDef[];
  podeEditarItens: boolean;
};

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

export function ListItemsSection({
  listNodeId,
  enabled,
  defaultView,
  userViewMode,
  onUserViewModeChange,
  kanbanColumnsRaw,
  customFieldDefs,
  podeEditarItens,
}: Props) {
  const [items, setItems] = useState<WorkspaceListItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragItemId, setDragItemId] = useState<string | null>(null);

  const cols = useMemo(() => parseKanbanColumns(kanbanColumnsRaw), [kanbanColumnsRaw]);
  const effectiveView = userViewMode ?? defaultView;

  const load = useCallback(async () => {
    if (!enabled || !listNodeId) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_list_items")
      .select("id, list_node_id, title, status_key, sort_order, custom_values, created_at")
      .eq("list_node_id", listNodeId)
      .order("sort_order")
      .order("created_at");

    if (error) {
      logSupabaseUnlessJwt("[list-items]", error);
      setItems([]);
      setLoading(false);
      return;
    }
    const rows = (data || []) as Array<
      Omit<WorkspaceListItemRow, "custom_values"> & { custom_values?: unknown }
    >;
    setItems(
      rows.map((r) => ({
        ...r,
        custom_values: parseCustomValues(r.custom_values),
      }))
    );
    setLoading(false);
  }, [enabled, listNodeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addItem() {
    if (!podeEditarItens || !listNodeId) return;
    const firstKey = cols[0]?.key ?? DEFAULT_KANBAN_COLUMNS[0].key;
    const next =
      items.length > 0 ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;
    const profile = await getCurrentProfile();
    const { error } = await supabase.from("workspace_list_items").insert({
      list_node_id: listNodeId,
      title: "Novo item",
      status_key: firstKey,
      sort_order: next,
      custom_values: {},
      created_by: profile?.id ?? null,
    });
    if (error) {
      showErrorToast("Não foi possível criar item", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Item criado", "");
    await load();
  }

  async function patchItem(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("workspace_list_items").update(patch).eq("id", id);
    if (error) {
      showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error));
      return;
    }
    await load();
  }

  async function removeItem(id: string) {
    if (!window.confirm("Excluir este item?")) return;
    const { error } = await supabase.from("workspace_list_items").delete().eq("id", id);
    if (error) {
      showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error));
      return;
    }
    await load();
  }

  function setCustomValue(item: WorkspaceListItemRow, fieldId: string, value: string | number | null) {
    const next = { ...item.custom_values, [fieldId]: value };
    void patchItem(item.id, { custom_values: next });
  }

  if (!enabled) {
    return (
      <Card className="p-4 mt-4" style={{ background: "var(--surface-2)" }}>
        <p className="text-sm text-muted m-0">
          Itens da lista, Kanban e campos customizados ficam disponíveis após executar{" "}
          <code>lib/sql/workspaces-spaces-extensions.sql</code> no Supabase.
        </p>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted">Conteúdo da lista</span>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg p-0.5 gap-0.5" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => onUserViewModeChange("list")}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
              style={{
                background: effectiveView === "list" ? "var(--surface)" : "transparent",
                color: effectiveView === "list" ? "var(--primary)" : "var(--muted-fg)",
                boxShadow: effectiveView === "list" ? "var(--shadow-sm)" : "none",
              }}
            >
              <LayoutList size={14} /> Lista
            </button>
            <button
              type="button"
              onClick={() => onUserViewModeChange("kanban")}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
              style={{
                background: effectiveView === "kanban" ? "var(--surface)" : "transparent",
                color: effectiveView === "kanban" ? "var(--primary)" : "var(--muted-fg)",
                boxShadow: effectiveView === "kanban" ? "var(--shadow-sm)" : "none",
              }}
            >
              <LayoutGrid size={14} /> Quadro
            </button>
          </div>
          {podeEditarItens && (
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => void addItem()}>
              Item
            </Button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-muted">Carregando itens…</p>}

      {!loading && effectiveView === "list" && (
        <div className="overflow-x-auto border rounded-xl" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                <th className="text-left p-2 font-bold" style={{ width: 36 }} />
                <th className="text-left p-2 font-bold">Título</th>
                <th className="text-left p-2 font-bold">Status</th>
                {customFieldDefs.map((f) => (
                  <th key={f.id} className="text-left p-2 font-bold whitespace-nowrap">
                    {f.name}
                  </th>
                ))}
                {podeEditarItens && <th className="p-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={3 + customFieldDefs.length + (podeEditarItens ? 1 : 0)} className="p-6 text-center text-muted">
                    Nenhum item. Adicione linhas para acompanhar entregas nesta lista.
                  </td>
                </tr>
              )}
              {items.map((it) => (
                <tr key={it.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="p-1 align-middle">
                    {podeEditarItens && (
                      <span className="inline-flex p-1 text-muted">
                        <GripVertical size={14} />
                      </span>
                    )}
                  </td>
                  <td className="p-2 align-middle">
                    <Input
                      value={it.title}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x))
                        )
                      }
                      onBlur={(e) => {
                        if (e.target.value !== it.title) void patchItem(it.id, { title: e.target.value.trim() || it.title });
                      }}
                      disabled={!podeEditarItens}
                      className="text-sm"
                    />
                  </td>
                  <td className="p-2 align-middle min-w-[140px]">
                    <Select
                      value={it.status_key}
                      onChange={(e) => void patchItem(it.id, { status_key: e.target.value })}
                      disabled={!podeEditarItens}
                    >
                      {cols.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  {customFieldDefs.map((f) => (
                    <td key={f.id} className="p-2 align-middle min-w-[120px]">
                      {f.type === "text" && (
                        <Input
                          value={String(it.custom_values[f.id] ?? "")}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id
                                  ? { ...x, custom_values: { ...x.custom_values, [f.id]: e.target.value } }
                                  : x
                              )
                            )
                          }
                          onBlur={(e) => setCustomValue(it, f.id, e.target.value || null)}
                          disabled={!podeEditarItens}
                        />
                      )}
                      {f.type === "number" && (
                        <Input
                          type="number"
                          value={it.custom_values[f.id] === null || it.custom_values[f.id] === undefined ? "" : String(it.custom_values[f.id])}
                          onChange={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id ? { ...x, custom_values: { ...x.custom_values, [f.id]: v } } : x
                              )
                            );
                          }}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            setCustomValue(it, f.id, v);
                          }}
                          disabled={!podeEditarItens}
                        />
                      )}
                      {f.type === "date" && (
                        <Input
                          type="date"
                          value={String(it.custom_values[f.id] ?? "").slice(0, 10)}
                          onChange={(e) => setCustomValue(it, f.id, e.target.value || null)}
                          disabled={!podeEditarItens}
                        />
                      )}
                      {f.type === "select" && (
                        <Select
                          value={String(it.custom_values[f.id] ?? "")}
                          onChange={(e) => setCustomValue(it, f.id, e.target.value || null)}
                          disabled={!podeEditarItens}
                        >
                          <option value="">—</option>
                          {(f.options || []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                  ))}
                  {podeEditarItens && (
                    <td className="p-1 align-middle">
                      <Button size="icon-sm" variant="danger-ghost" onClick={() => void removeItem(it.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && effectiveView === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minHeight: 280 }}>
          {cols.map((col) => {
            const colItems = items.filter((i) => i.status_key === col.key);
            return (
              <div
                key={col.key}
                className="flex-shrink-0 rounded-xl flex flex-col"
                style={{
                  width: 260,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("application/x-workspace-list-item");
                  if (!id) return;
                  void patchItem(id, { status_key: col.key });
                  setDragItemId(null);
                }}
              >
                <div
                  className="px-3 py-2 font-bold text-xs uppercase border-b"
                  style={{ borderColor: "var(--border)" }}
                >
                  {col.label}{" "}
                  <span className="text-muted">({colItems.length})</span>
                </div>
                <div className="p-2 flex flex-col gap-2 flex-1 overflow-y-auto" style={{ maxHeight: 420 }}>
                  {colItems.map((it) => (
                    <Card
                      key={it.id}
                      className="p-2 shadow-sm"
                      draggable={podeEditarItens}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-workspace-list-item", it.id);
                        setDragItemId(it.id);
                      }}
                      onDragEnd={() => setDragItemId(null)}
                      style={{
                        opacity: dragItemId === it.id ? 0.6 : 1,
                        cursor: podeEditarItens ? "grab" : "default",
                      }}
                    >
                      <Input
                        value={it.title}
                        onChange={(e) =>
                          setItems((prev) =>
                            prev.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x))
                          )
                        }
                        onBlur={(e) => {
                          if (e.target.value.trim() !== it.title)
                            void patchItem(it.id, { title: e.target.value.trim() || it.title });
                        }}
                        disabled={!podeEditarItens}
                        className="text-sm font-semibold mb-2"
                      />
                      {customFieldDefs.slice(0, 3).map((f) => (
                        <div key={f.id} className="text-[11px] text-muted mb-0.5">
                          <span className="font-semibold">{f.name}: </span>
                          {String(it.custom_values[f.id] ?? "—")}
                        </div>
                      ))}
                      {podeEditarItens && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-1 w-full"
                          onClick={() => void removeItem(it.id)}
                        >
                          Excluir
                        </Button>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
