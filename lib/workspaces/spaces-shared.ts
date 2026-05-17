/** Tipos e helpers compartilhados — Espaços / listas / kanban */

export type WorkspaceViewMode = "list" | "kanban";

export type KanbanColumnDef = { key: string; label: string; color?: string };

export type CustomFieldDef = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "select";
  options?: string[];
};

export const DEFAULT_KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: "previsto",         label: "Previsto",         color: "#64748b" },
  { key: "planejado",        label: "Planejado",        color: "#c026d3" },
  { key: "em_andamento",     label: "Em andamento",     color: "#d97706" },
  { key: "paralisado",       label: "Paralisado",       color: "#dc2626" },
  { key: "cancelado",        label: "Cancelado",        color: "#94a3b8" },
  { key: "aprovacao_copasa", label: "Aprovação COPASA", color: "#2563eb" },
];

export type WorkspaceTreeNode = {
  id: string;
  space_id: string;
  parent_id: string | null;
  kind: "folder" | "list";
  name: string;
  color: string | null;
  sort_order: number;
  project_id: string | null;
  default_view?: WorkspaceViewMode;
  custom_field_definitions?: CustomFieldDef[] | null;
  kanban_columns?: unknown;
};

export function parseKanbanColumns(raw: unknown): KanbanColumnDef[] {
  if (!raw || !Array.isArray(raw)) return DEFAULT_KANBAN_COLUMNS;
  const out: KanbanColumnDef[] = [];
  for (const row of raw) {
    if (row && typeof row === "object" && "key" in row && "label" in row) {
      const key = String((row as KanbanColumnDef).key || "").trim();
      const label = String((row as KanbanColumnDef).label || "").trim();
      if (key && label) out.push({ key, label });
    }
  }
  return out.length > 0 ? out : DEFAULT_KANBAN_COLUMNS;
}

export function parseCustomFieldDefs(raw: unknown): CustomFieldDef[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id || "").trim();
    const name = String(r.name || "").trim();
    const type = r.type as CustomFieldDef["type"];
    if (!id || !name) continue;
    if (!["text", "number", "date", "select"].includes(type)) continue;
    const def: CustomFieldDef = { id, name, type };
    if (type === "select" && Array.isArray(r.options)) {
      def.options = r.options.map((o) => String(o));
    }
    out.push(def);
  }
  return out;
}

export function isDescendant(
  nodes: Pick<WorkspaceTreeNode, "id" | "parent_id">[],
  ancestorId: string,
  nodeId: string
): boolean {
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    if (cur === ancestorId) return true;
    const n = nodes.find((x) => x.id === cur);
    cur = n?.parent_id ?? null;
  }
  return false;
}

function siblingsOrdered(
  nodes: WorkspaceTreeNode[],
  spaceId: string,
  parentId: string | null,
  excludeId?: string
): WorkspaceTreeNode[] {
  return nodes
    .filter(
      (n) =>
        n.space_id === spaceId &&
        n.parent_id === parentId &&
        (!excludeId || n.id !== excludeId)
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
}

export type TreePlacement = "before" | "after" | "inside";

/** Retorna atualizações { id, parent_id, sort_order } após arrastar `draggedId` em relação a `targetId`. */
export function computeTreeMove(
  nodes: WorkspaceTreeNode[],
  spaceId: string,
  draggedId: string,
  targetId: string,
  placement: TreePlacement
): { id: string; parent_id: string | null; sort_order: number }[] | null {
  const dragged = nodes.find((n) => n.id === draggedId);
  const target = nodes.find((n) => n.id === targetId);
  if (!dragged || !target || dragged.space_id !== spaceId || target.space_id !== spaceId) return null;
  if (draggedId === targetId) return null;

  let newParentId: string | null;
  let insertBeforeId: string | null;

  if (placement === "inside") {
    if (target.kind !== "folder") return null;
    if (isDescendant(nodes, draggedId, targetId)) return null;
    newParentId = targetId;
    insertBeforeId = null;
  } else {
    newParentId = target.parent_id;
    if (placement === "before") {
      insertBeforeId = targetId;
    } else {
      const sibs = siblingsOrdered(nodes, spaceId, newParentId, draggedId);
      const idx = sibs.findIndex((s) => s.id === targetId);
      if (idx < 0) return null;
      const next = sibs[idx + 1];
      insertBeforeId = next?.id ?? null;
    }
  }

  if (newParentId) {
    const p = nodes.find((n) => n.id === newParentId);
    if (!p || p.kind !== "folder" || p.space_id !== spaceId) return null;
    if (isDescendant(nodes, draggedId, newParentId)) return null;
  }

  const others = siblingsOrdered(nodes, spaceId, newParentId, draggedId);
  let insertIdx = others.length;
  if (insertBeforeId) {
    const i = others.findIndex((s) => s.id === insertBeforeId);
    if (i >= 0) insertIdx = i;
  }
  const ordered = [...others.slice(0, insertIdx), dragged, ...others.slice(insertIdx)];
  return ordered.map((n, i) => ({
    id: n.id,
    parent_id: newParentId,
    sort_order: i,
  }));
}

/** Mover nó para o fim dos filhos da raiz do espaço. */
export function computeMoveToRootEnd(
  nodes: WorkspaceTreeNode[],
  spaceId: string,
  draggedId: string
): { id: string; parent_id: string | null; sort_order: number }[] | null {
  const dragged = nodes.find((n) => n.id === draggedId);
  if (!dragged || dragged.space_id !== spaceId) return null;
  const others = siblingsOrdered(nodes, spaceId, null, draggedId);
  const ordered = [...others, dragged];
  return ordered.map((n, i) => ({
    id: n.id,
    parent_id: null,
    sort_order: i,
  }));
}

export function slugKey(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 24) || "col";
  let k = base;
  let n = 0;
  while (taken.has(k)) {
    n += 1;
    k = `${base}_${n}`;
  }
  taken.add(k);
  return k;
}
