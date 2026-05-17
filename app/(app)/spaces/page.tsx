"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Folder,
  ListTodo,
  Plus,
  Trash2,
  Building2,
  Briefcase,
  Factory,
  MapPin,
  Home,
  Grid3x3,
  Sparkles,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  BadgeCheck,
  Hourglass,
  ExternalLink,
  Settings,
  ChevronRight,
  ChevronDown,
  GripVertical,
  ArrowUp,
  ArrowDown,
  X,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage, logSupabaseUnlessJwt, extractPostgrestErrorMessage } from "@/lib/supabase/errors";
import { ensureFreshSupabaseSession } from "@/lib/supabase/session-refresh";
import { canEditWorkspaceNodes, canManageWorkspaceSpaces } from "@/lib/permissions";
import { formatProjectDisplayName } from "@/lib/project-display";
import { projectQualifiesForSaneamentoModule } from "@/lib/saneamento/discipline";
import {
  type WorkspaceTreeNode,
  type TreePlacement,
  type WorkspaceViewMode,
  type CustomFieldDef,
  computeTreeMove,
  computeMoveToRootEnd,
  parseCustomFieldDefs,
} from "@/lib/workspaces/spaces-shared";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ListItemsSection } from "@/components/spaces/list-items-section";
import { KanbanColumnsEditor } from "@/components/spaces/kanban-columns-editor";
import { ProjectTaskBoard } from "@/components/spaces/project-task-board";

// ─── Types ───────────────────────────────────────────────────────────────────

type UserPrefsPayload = {
  treeExpanded?: Record<string, boolean>;
  listViewByNode?: Record<string, WorkspaceViewMode>;
};

const NODE_SELECT_EXTENDED =
  "id, space_id, parent_id, kind, name, color, sort_order, project_id, default_view, custom_field_definitions, kanban_columns, projects(id, name, municipality, state, discipline, sanitation_type)";

const NODE_SELECT_BASIC =
  "id, space_id, parent_id, kind, name, color, sort_order, project_id, projects(id, name, municipality, state, discipline, sanitation_type)";

function isColumnMissingError(err: unknown): boolean {
  const m = extractPostgrestErrorMessage(err).toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    (m.includes("does not exist") && (m.includes("default_view") || m.includes("custom_field") || m.includes("kanban")))
  );
}

type WorkspaceSpace = {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
};

type WorkspaceNode = {
  id: string;
  space_id: string;
  parent_id: string | null;
  kind: "folder" | "list";
  name: string;
  color: string | null;
  sort_order: number;
  project_id: string | null;
  default_view?: WorkspaceViewMode;
  custom_field_definitions?: CustomFieldDef[];
  kanban_columns?: unknown;
  projects?: {
    id: string;
    name: string;
    municipality: string | null;
    state: string | null;
    discipline: string | null;
    sanitation_type: string | null;
  } | null;
};

type ProjectPick = {
  id: string;
  name: string;
  municipality: string | null;
  state: string | null;
  discipline: string | null;
  sanitation_type: string | null;
};

type ProjectEmbed = NonNullable<WorkspaceNode["projects"]>;

function normalizeProjectEmbed(raw: unknown): ProjectEmbed | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as ProjectEmbed | undefined) ?? null;
  return raw as ProjectEmbed;
}

// ─── Space icons ─────────────────────────────────────────────────────────────

const SPACE_ICON_KEYS = ["concluido", "em_andamento", "paralisado", "aprovado", "aprovacao"] as const;

const SPACE_ICON_LABELS: Record<(typeof SPACE_ICON_KEYS)[number], string> = {
  concluido: "Concluído",
  em_andamento: "Em andamento",
  paralisado: "Paralisado",
  aprovado: "Aprovado",
  aprovacao: "Aprovação",
};

const DEFAULT_SPACE_ICON = "em_andamento" as const;

const SPACE_ICON_MAP: Record<string, LucideIcon> = {
  concluido: CheckCircle2,
  em_andamento: PlayCircle,
  paralisado: PauseCircle,
  aprovado: BadgeCheck,
  aprovacao: Hourglass,
  layers: Layers,
  building2: Building2,
  briefcase: Briefcase,
  factory: Factory,
  map: MapPin,
  home: Home,
  grid: Grid3x3,
  sparkles: Sparkles,
};

function SpaceGlyph({ icon, color, size = 14 }: { icon: string; color: string; size?: number }) {
  const Icon = SPACE_ICON_MAP[icon] ?? PlayCircle;
  return <Icon size={size} style={{ color }} />;
}

const FALLBACK_SPACE_HEX = "#6366f1" as const;

const COLOR_PRESETS = ["#6366f1", "#0d9488", "#2563eb", "#c026d3", "#ea580c", "#ca8a04", "#4f46e5", "#64748b"] as const;

function normalizePickerHex(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/i.test(s)) {
    const x = s.slice(1);
    return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
  }
  return FALLBACK_SPACE_HEX;
}

// ─── Schema detection ─────────────────────────────────────────────────────────

function schemaLikelyMissing(err: unknown): boolean {
  // Use raw message so table/column names are preserved before normalization
  const s = extractPostgrestErrorMessage(err).toLowerCase();
  return (
    s.includes("workspace_spaces") ||
    s.includes("workspace_space_nodes") ||
    s.includes("workspace_list_items") ||
    s.includes("user_workspace_prefs") ||
    (s.includes("relation") && s.includes("does not exist")) ||
    (s.includes("table") && s.includes("does not exist"))
  );
}

function mapRowToWorkspaceNode(r: Record<string, unknown>, extensionsOk: boolean): WorkspaceNode {
  return {
    id: String(r.id),
    space_id: String(r.space_id),
    parent_id: (r.parent_id as string | null) ?? null,
    kind: r.kind as "folder" | "list",
    name: String(r.name),
    color: (r.color as string | null) ?? null,
    sort_order: Number(r.sort_order),
    project_id: (r.project_id as string | null) ?? null,
    projects: normalizeProjectEmbed(r.projects),
    default_view: extensionsOk && r.default_view === "kanban" ? "kanban" : extensionsOk ? "list" : undefined,
    custom_field_definitions: extensionsOk ? parseCustomFieldDefs(r.custom_field_definitions) : undefined,
    kanban_columns: extensionsOk ? r.kanban_columns : undefined,
  };
}

function siblingsOf(nodes: WorkspaceNode[], spaceId: string, parentId: string | null): WorkspaceNode[] {
  return nodes
    .filter((n) => n.space_id === spaceId && n.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
}

// ─── Sidebar tree ─────────────────────────────────────────────────────────────

function SidebarTree({
  nodes,
  spaceId,
  selectedNodeId,
  expandedFolders,
  onToggleFolder,
  onSelectNode,
  podeEditar,
  onMoveUpDown,
  onAddChild,
  onAddProject,
  onDeleteNode,
}: {
  nodes: WorkspaceNode[];
  spaceId: string;
  selectedNodeId: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  onSelectNode: (id: string) => void;
  podeEditar: boolean;
  onMoveUpDown: (node: WorkspaceNode, dir: -1 | 1) => void;
  onAddChild?: (kind: "folder" | "list", parentId: string) => void;
  onAddProject?: (parentId: string) => void;
  onDeleteNode?: (id: string) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  function renderBranch(parentId: string | null, depth: number) {
    const list = nodes
      .filter((n) => n.space_id === spaceId && n.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));

    return list.map((node) => {
      const isFolder = node.kind === "folder";
      const open = expandedFolders[node.id] ?? true;
      const isSelected = selectedNodeId === node.id;
      const isHovered = hoverId === node.id;
      const nodeColor = node.color || (isFolder ? "var(--warning)" : "var(--primary)");

      return (
        <div key={node.id} style={{ marginLeft: depth > 0 ? 12 : 0 }}>
          <div
            onMouseEnter={() => setHoverId(node.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              borderRadius: 6,
              background: isSelected
                ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                : isHovered
                  ? "color-mix(in srgb, var(--foreground) 5%, transparent)"
                  : "transparent",
              border: `1px solid ${isSelected ? "color-mix(in srgb, var(--primary) 30%, transparent)" : "transparent"}`,
              marginBottom: 1,
            }}
          >
            {/* Expand/collapse for folders */}
            {isFolder ? (
              <button
                type="button"
                onClick={() => onToggleFolder(node.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 2px", color: "var(--muted-fg)", flexShrink: 0, display: "flex", alignItems: "center" }}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : (
              <span style={{ width: 16, flexShrink: 0 }} />
            )}

            {/* Icon + name */}
            <button
              type="button"
              onClick={() => {
                onSelectNode(node.id);
                // Expande a pasta ao selecionar, mas NÃO fecha — colapsar é só pelo chevron
                if (isFolder && !open) onToggleFolder(node.id);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                flex: 1,
                minWidth: 0,
                padding: "5px 4px",
                textAlign: "left",
              }}
            >
              {isFolder ? (
                <Folder size={13} style={{ color: nodeColor, flexShrink: 0 }} />
              ) : (
                <ListTodo size={13} style={{ color: nodeColor, flexShrink: 0 }} />
              )}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? "var(--foreground)" : "var(--muted-fg)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {node.name}
              </span>
              {node.kind === "list" && node.project_id && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--primary)",
                    flexShrink: 0,
                  }}
                  title="Vinculado a projeto"
                />
              )}
            </button>

            {/* Hover actions */}
            {podeEditar && (isHovered || isSelected) && (
              <div
                style={{ display: "flex", alignItems: "center", gap: 1, paddingRight: 4, flexShrink: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Add subfolder / add list / add project (folders only) */}
                {isFolder && (
                  <>
                    {onAddChild && (
                      <>
                        <button
                          type="button"
                          title="Nova subpasta"
                          onClick={(e) => { e.stopPropagation(); onAddChild("folder", node.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", borderRadius: 4, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--warning)"; e.currentTarget.style.background = "color-mix(in srgb, var(--warning) 12%, transparent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.background = "none"; }}
                        >
                          <Folder size={10} /><Plus size={8} />
                        </button>
                        <button
                          type="button"
                          title="Nova lista"
                          onClick={(e) => { e.stopPropagation(); onAddChild("list", node.id); }}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", borderRadius: 4, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700 }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--primary)"; e.currentTarget.style.background = "color-mix(in srgb, var(--primary) 12%, transparent)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.background = "none"; }}
                        >
                          <ListTodo size={10} /><Plus size={8} />
                        </button>
                      </>
                    )}
                    {onAddProject && (
                      <button
                        type="button"
                        title="Vincular projeto nesta pasta"
                        onClick={(e) => { e.stopPropagation(); onAddProject(node.id); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", borderRadius: 4, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 2, fontSize: 9, fontWeight: 700 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#0d9488"; e.currentTarget.style.background = "color-mix(in srgb, #0d9488 12%, transparent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.background = "none"; }}
                      >
                        <Briefcase size={10} /><Plus size={8} />
                      </button>
                    )}
                  </>
                )}

                {/* Delete node */}
                {onDeleteNode && (
                  <button
                    type="button"
                    title={`Excluir ${isFolder ? "pasta" : "lista"}`}
                    onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", borderRadius: 4, color: "var(--muted-fg)", display: "flex", alignItems: "center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.background = "color-mix(in srgb, #ef4444 12%, transparent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.background = "none"; }}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Children */}
          {isFolder && open && renderBranch(node.id, depth + 1)}
        </div>
      );
    });
  }

  return <div>{renderBranch(null, 0)}</div>;
}

// ─── Painel de configurações (modal) ─────────────────────────────────────────

function SettingsPanel({
  space,
  node,
  projects,
  extensionsOk,
  podeGerirEspacos,
  podeEditar,
  onClose,
  onSaveSpace,
  onPatchNode,
  onDeleteNode,
  onAddChild,
  saneHref,
}: {
  space: WorkspaceSpace | null;
  node: WorkspaceNode | null;
  projects: ProjectPick[];
  extensionsOk: boolean;
  podeGerirEspacos: boolean;
  podeEditar: boolean;
  onClose: () => void;
  onSaveSpace: (id: string, patch: Partial<Pick<WorkspaceSpace, "name" | "color" | "icon">>) => void;
  onPatchNode: (patch: Record<string, unknown>) => void;
  onDeleteNode: () => void;
  onAddChild: (kind: "folder" | "list", parentId: string) => void;
  saneHref: string | null;
}) {
  const [spaceName, setSpaceName] = useState(space?.name ?? "");
  const [spaceColor, setSpaceColor] = useState(() => normalizePickerHex(space?.color));
  const [spaceIcon, setSpaceIcon] = useState(() => space?.icon?.trim() || DEFAULT_SPACE_ICON);
  const [nodeName, setNodeName] = useState(node?.name ?? "");
  const [nodeProjectId, setNodeProjectId] = useState(node?.project_id ?? "");
  const nativePickerRef = useRef<HTMLInputElement>(null);
  const pickerHex = normalizePickerHex(spaceColor);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>(() => node?.custom_field_definitions ?? []);

  useEffect(() => {
    if (space) { setSpaceName(space.name); setSpaceColor(normalizePickerHex(space.color)); setSpaceIcon(space.icon?.trim() || DEFAULT_SPACE_ICON); }
  }, [space?.id]);

  useEffect(() => {
    if (node) { setNodeName(node.name); setNodeProjectId(node.project_id ?? ""); setCustomFields(node.custom_field_definitions ?? []); }
  }, [node?.id]);

  function addCustomField() {
    const id = `cf_${crypto.randomUUID().slice(0, 8)}`;
    setCustomFields((prev) => [...prev, { id, name: "Novo campo", type: "text" }]);
  }

  function updateField(i: number, patch: Partial<CustomFieldDef>) {
    setCustomFields((prev) => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  function removeField(i: number) {
    setCustomFields((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100vh - 32px)",
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-2)",
          }}
        >
          <span className="text-sm font-bold">Configurações</span>
          <Button size="icon-sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: 20 }} className="space-y-6">
          {/* Space settings */}
          {space && podeGerirEspacos && (
            <div>
              <div className="text-xs font-bold uppercase text-muted mb-3">Espaço</div>
              <div className="space-y-3">
                <Field label="Nome do espaço">
                  <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} />
                </Field>
                <Field label="Ícone">
                  <div className="grid grid-cols-3 gap-2">
                    {SPACE_ICON_KEYS.map((k) => {
                      const Icon = SPACE_ICON_MAP[k] ?? PlayCircle;
                      const active = spaceIcon === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setSpaceIcon(k)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            padding: "8px 4px",
                            borderRadius: 8,
                            border: `2px solid ${active ? "var(--primary)" : "var(--border)"}`,
                            background: active ? "var(--primary-soft)" : "var(--surface)",
                            cursor: "pointer",
                          }}
                        >
                          <Icon size={18} style={{ color: active ? "var(--primary)" : "var(--muted-fg)" }} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: active ? "var(--primary)" : "var(--muted-fg)" }}>
                            {SPACE_ICON_LABELS[k]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Cor">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSpaceColor(c)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          background: c,
                          border: spaceColor.toLowerCase() === c.toLowerCase() ? "3px solid var(--foreground)" : "2px solid var(--border)",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <input ref={nativePickerRef} type="color" value={pickerHex} onChange={(e) => setSpaceColor(e.target.value)} style={{ position: "absolute", left: -9999, opacity: 0 }} />
                    <button
                      type="button"
                      onClick={() => nativePickerRef.current?.click()}
                      style={{ width: 32, height: 32, borderRadius: 6, background: pickerHex, border: "1px solid var(--border)", cursor: "pointer", flexShrink: 0 }}
                    />
                    <Input value={spaceColor} onChange={(e) => setSpaceColor(e.target.value)} className="font-mono text-xs" placeholder="#6366f1" />
                  </div>
                </Field>
                <Button
                  size="sm"
                  onClick={() => space && onSaveSpace(space.id, { name: spaceName.trim() || space.name, color: spaceColor, icon: spaceIcon })}
                >
                  Salvar espaço
                </Button>
              </div>
            </div>
          )}

          {/* Node settings */}
          {node && (
            <div>
              <div className="text-xs font-bold uppercase text-muted mb-3 flex items-center gap-2">
                {node.kind === "folder" ? <Folder size={12} /> : <ListTodo size={12} />}
                {node.kind === "folder" ? "Pasta" : "Lista"}
              </div>
              <div className="space-y-3">
                <Field label="Nome">
                  <div className="flex gap-2">
                    <Input value={nodeName} onChange={(e) => setNodeName(e.target.value)} disabled={!podeEditar} />
                    {podeEditar && (
                      <Button size="sm" onClick={() => onPatchNode({ name: nodeName.trim() || node.name })}>OK</Button>
                    )}
                  </div>
                </Field>

                {node.kind === "list" && extensionsOk && (
                  <>
                    <Field label="Vista padrão">
                      <Select
                        value={node.default_view || "list"}
                        onChange={(e) => onPatchNode({ default_view: e.target.value === "kanban" ? "kanban" : "list" })}
                        disabled={!podeEditar}
                      >
                        <option value="list">Lista</option>
                        <option value="kanban">Quadro (Kanban)</option>
                      </Select>
                    </Field>

                    <div>
                      <div className="text-xs font-semibold text-muted mb-2">Colunas Kanban</div>
                      <KanbanColumnsEditor
                        valueRaw={node.kanban_columns}
                        podeEditar={podeEditar}
                        onSave={(cols) => onPatchNode({ kanban_columns: cols })}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-muted">Campos customizados</span>
                        {podeEditar && (
                          <Button size="sm" variant="secondary" leftIcon={<Plus size={12} />} onClick={addCustomField}>Campo</Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {customFields.map((f, i) => (
                          <div key={f.id} className="flex gap-2 items-end p-2 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                            <Field label="Nome" className="flex-1 mb-0">
                              <Input value={f.name} onChange={(e) => updateField(i, { name: e.target.value })} disabled={!podeEditar} />
                            </Field>
                            <Field label="Tipo" className="w-28 mb-0">
                              <Select
                                value={f.type}
                                onChange={(e) => updateField(i, { type: e.target.value as CustomFieldDef["type"], options: e.target.value === "select" ? f.options ?? ["A", "B"] : undefined })}
                                disabled={!podeEditar}
                              >
                                <option value="text">Texto</option>
                                <option value="number">Número</option>
                                <option value="date">Data</option>
                                <option value="select">Lista</option>
                              </Select>
                            </Field>
                            {podeEditar && (
                              <Button size="icon-sm" variant="danger-ghost" onClick={() => removeField(i)}><Trash2 size={13} /></Button>
                            )}
                          </div>
                        ))}
                      </div>
                      {podeEditar && customFields.length > 0 && (
                        <Button className="mt-2" size="sm" onClick={() => onPatchNode({ custom_field_definitions: customFields })}>
                          Salvar campos
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {node.kind === "list" && (
                  <Field label="Vincular projeto">
                    <div className="space-y-2">
                      <Select value={nodeProjectId} onChange={(e) => setNodeProjectId(e.target.value)} disabled={!podeEditar}>
                        <option value="">— Nenhum —</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{formatProjectDisplayName(p)}</option>
                        ))}
                      </Select>
                      {podeEditar && (
                        <Button size="sm" variant="secondary" onClick={() => onPatchNode({ project_id: nodeProjectId || null })}>
                          Salvar vínculo
                        </Button>
                      )}
                    </div>
                  </Field>
                )}

                {node.kind === "list" && node.projects && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Link href="/projects">
                      <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={12} />}>Projetos</Button>
                    </Link>
                    {saneHref && (
                      <Link href={saneHref}>
                        <Button size="sm" leftIcon={<ExternalLink size={12} />}>Módulo saneamento</Button>
                      </Link>
                    )}
                  </div>
                )}

                {node.kind === "folder" && podeEditar && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" leftIcon={<Folder size={12} />} onClick={() => onAddChild("folder", node.id)}>
                      Subpasta
                    </Button>
                    <Button size="sm" leftIcon={<ListTodo size={12} />} onClick={() => onAddChild("list", node.id)}>
                      Lista interna
                    </Button>
                  </div>
                )}

                {podeEditar && (
                  <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={13} />} onClick={onDeleteNode}>
                    Excluir {node.kind === "folder" ? "pasta" : "lista"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Criar espaço ──────────────────────────────────────────────────────

function AddSpaceModal({
  nextSortOrder,
  onClose,
  onCreated,
}: {
  nextSortOrder: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(FALLBACK_SPACE_HEX);
  const [icon, setIcon] = useState<string>(DEFAULT_SPACE_ICON);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    const profile = await getCurrentProfile();
    const row: Record<string, unknown> = {
      name: name.trim(),
      color,
      icon,
      sort_order: nextSortOrder,
    };
    if (profile?.id) row.created_by = profile.id;
    const { data, error } = await supabase.from("workspace_spaces").insert(row).select("id").single();
    if (error) {
      if (schemaLikelyMissing(error)) {
        showErrorToast("Tabelas de Espaços não encontradas", "Execute lib/sql/workspaces-spaces.sql no Supabase.");
      } else {
        showErrorToast("Não foi possível criar o espaço", getSupabaseErrorMessage(error));
      }
      setLoading(false);
      return;
    }
    showSuccessToast("Espaço criado");
    onCreated(data.id);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 400, background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-2)" }}>
          <span className="text-sm font-bold">Novo espaço</span>
          <Button size="icon-sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
        </div>
        <div style={{ padding: 20 }} className="space-y-4">
          <Field label="Nome">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              placeholder="Ex.: COPASA"
            />
          </Field>
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "3px solid var(--foreground)" : "2px solid var(--border)", cursor: "pointer" }}
                />
              ))}
            </div>
          </Field>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--surface-2)" }}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={() => void handleCreate()} loading={loading} disabled={!name.trim() || loading}>
            Criar espaço
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente: botão compacto para adicionar pasta/lista/projeto ──────────

function AddNodeBtn({
  kind,
  label,
  onClick,
  icon,
}: {
  kind: "folder" | "list" | "project";
  label: string;
  onClick: () => void;
  icon?: JSX.Element;
}) {
  const defaultIcon =
    kind === "folder" ? <Folder size={10} /> :
    kind === "project" ? <Briefcase size={10} /> :
    <ListTodo size={10} />;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "transparent",
        border: "1px dashed var(--border)",
        borderRadius: 5,
        cursor: "pointer",
        color: "var(--muted-fg)",
        fontSize: 10,
        fontWeight: 600,
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        gap: 3,
        transition: "all 0.12s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-fg)"; }}
    >
      {icon ?? defaultIcon}
      {label}
    </button>
  );
}

// ─── Modal: Vincular projeto ao espaço ───────────────────────────────────────

function ProjectPickerModal({
  projects,
  linkedProjectIds,
  parentFolderName,
  onClose,
  onSelect,
}: {
  projects: ProjectPick[];
  linkedProjectIds: Set<string>;
  parentFolderName: string | null;
  onClose: () => void;
  onSelect: (project: ProjectPick) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(s) ||
      (p.municipality ?? "").toLowerCase().includes(s) ||
      (p.state ?? "").toLowerCase().includes(s) ||
      (p.discipline ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 540, maxHeight: "72vh", background: "var(--background)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "var(--surface-2)" }}>
          <div>
            <span className="text-sm font-bold">Vincular projeto</span>
            {parentFolderName ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                <Folder size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                  Será adicionado em <strong style={{ color: "var(--foreground)" }}>{parentFolderName}</strong>
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderRadius: 6, padding: "4px 8px" }}>
                <Folder size={12} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>
                  Passe o mouse sobre uma pasta na barra lateral e clique em 💼+ para vincular dentro dela.
                </span>
              </div>
            )}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}><X size={16} /></Button>
        </div>

        {/* Search */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
          <Input
            autoFocus
            placeholder="Buscar por nome, município, estado…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <p className="text-sm text-muted">Nenhum projeto encontrado.</p>
            </div>
          )}
          {filtered.map((p) => {
            const alreadyLinked = linkedProjectIds.has(p.id);
            const subtitle = [p.municipality, p.state, p.discipline].filter(Boolean).join(" · ");
            return (
              <button
                key={p.id}
                type="button"
                disabled={alreadyLinked}
                onClick={() => { if (!alreadyLinked) onSelect(p); }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: alreadyLinked ? "default" : "pointer",
                  textAlign: "left",
                  opacity: alreadyLinked ? 0.55 : 1,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!alreadyLinked) e.currentTarget.style.background = "var(--surface-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: "color-mix(in srgb, var(--primary) 12%, var(--surface))",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)",
                  }}
                >
                  <Briefcase size={15} style={{ color: "var(--primary)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  {subtitle && <div className="text-xs text-muted truncate">{subtitle}</div>}
                </div>
                {alreadyLinked ? (
                  <Badge variant="neutral" style={{ fontSize: 10, flexShrink: 0 }}>Já vinculado</Badge>
                ) : (
                  <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 600, flexShrink: 0 }}>+ Adicionar</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Componente: input inline para criar pasta/lista ─────────────────────────

function InlineNodeInput({
  kind,
  parentId,
  nodes,
  onConfirm,
  onCancel,
}: {
  kind: "folder" | "list";
  parentId: string | null;
  nodes: WorkspaceNode[];
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const parentName = parentId ? nodes.find((n) => n.id === parentId)?.name : null;

  function commit() {
    if (value.trim()) onConfirm(value.trim());
    else onCancel();
  }

  return (
    <div
      style={{
        margin: "4px 6px 6px",
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--primary)",
        boxShadow: "0 0 0 2px color-mix(in srgb, var(--primary) 15%, transparent)",
      }}
    >
      {parentName && (
        <div className="text-xs text-muted mb-1" style={{ fontWeight: 500 }}>
          {kind === "folder" ? "Subpasta" : "Lista"} em: <strong>{parentName}</strong>
        </div>
      )}
      <div className="flex items-center gap-2">
        {kind === "folder" ? <Folder size={12} style={{ color: "var(--warning)", flexShrink: 0 }} /> : <ListTodo size={12} style={{ color: "var(--primary)", flexShrink: 0 }} />}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder={kind === "folder" ? "Nome da pasta…" : "Nome da lista…"}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={commit}
          disabled={!value.trim()}
          style={{ background: "var(--primary)", border: "none", borderRadius: 4, color: "#fff", cursor: value.trim() ? "pointer" : "not-allowed", padding: "2px 8px", fontSize: 11, fontWeight: 600, opacity: value.trim() ? 1 : 0.5 }}
        >
          OK
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: 2 }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SpacesPage() {
  const [myRole, setMyRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [schemaBanner, setSchemaBanner] = useState<string | null>(null);

  const [spaces, setSpaces] = useState<WorkspaceSpace[]>([]);
  const [nodes, setNodes] = useState<WorkspaceNode[]>([]);
  const [projects, setProjects] = useState<ProjectPick[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [extensionsOk, setExtensionsOk] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefsPayload>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSpaceOpen, setAddSpaceOpen] = useState(false);
  const [addingNode, setAddingNode] = useState<{ kind: "folder" | "list"; parentId: string | null } | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectPickerParentId, setProjectPickerParentId] = useState<string | null>(null);
  const prefsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<string | null>(null);
  userIdRef.current = userId;

  const podeGerirEspacos = canManageWorkspaceSpaces(myRole);
  const podeEditarNos = canEditWorkspaceNodes(myRole);

  const debounceSavePrefs = useCallback((payload: UserPrefsPayload) => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (prefsTimerRef.current) clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("user_workspace_prefs").upsert(
        { user_id: uid, prefs: payload as unknown as Record<string, unknown>, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
      if (error) logSupabaseUnlessJwt("[spaces] prefs", error);
    }, 450);
  }, []);

  const loadPrefs = useCallback(async (uid: string) => {
    const { data, error } = await supabase.from("user_workspace_prefs").select("prefs").eq("user_id", uid).maybeSingle();
    if (error) { if (!schemaLikelyMissing(error)) logSupabaseUnlessJwt("[spaces] prefs load", error); return; }
    const p = (data?.prefs || {}) as UserPrefsPayload;
    setUserPrefs(p);
    if (p.treeExpanded && Object.keys(p.treeExpanded).length > 0) setExpandedFolders(p.treeExpanded);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setSchemaBanner(null);
    setExtensionsOk(false);
    await ensureFreshSupabaseSession();

    const [spRes, projRes] = await Promise.all([
      supabase.from("workspace_spaces").select("*").order("sort_order").order("name"),
      supabase.from("projects").select("id, name, municipality, state, discipline, sanitation_type").order("name"),
    ]);

    if (spRes.error) {
      if (schemaLikelyMissing(spRes.error)) {
        setSchemaBanner("As tabelas de Espaços ainda não existem. Execute lib/sql/workspaces-spaces.sql no Supabase.");
        setSpaces([]);
        setNodes([]);
      } else {
        logSupabaseUnlessJwt("[spaces] list", spRes.error);
        showErrorToast("Não foi possível carregar espaços", getSupabaseErrorMessage(spRes.error));
        setSpaces([]);
        setNodes([]);
      }
      setLoading(false);
      return;
    }

    setSpaces((spRes.data as WorkspaceSpace[]) || []);
    const sidList = ((spRes.data as WorkspaceSpace[]) || []).map((s) => s.id);

    if (sidList.length === 0) {
      setNodes([]);
      setExtensionsOk(false);
      if (!projRes.error) setProjects((projRes.data as ProjectPick[]) || []);
      setLoading(false);
      return;
    }

    let ext = true;
    const resExt = await supabase.from("workspace_space_nodes").select(NODE_SELECT_EXTENDED).in("space_id", sidList).order("sort_order").order("name");
    let rows: Array<Record<string, unknown>> = [];

    if (!resExt.error) {
      rows = (resExt.data || []) as Array<Record<string, unknown>>;
    } else if (isColumnMissingError(resExt.error)) {
      ext = false;
      const resBasic = await supabase.from("workspace_space_nodes").select(NODE_SELECT_BASIC).in("space_id", sidList).order("sort_order").order("name");
      if (resBasic.error) {
        logSupabaseUnlessJwt("[spaces] nodes", resBasic.error);
        showErrorToast("Não foi possível carregar pastas/listas");
        setLoading(false);
        return;
      }
      rows = (resBasic.data || []) as Array<Record<string, unknown>>;
    } else {
      logSupabaseUnlessJwt("[spaces] nodes", resExt.error);
      showErrorToast("Não foi possível carregar pastas/listas");
      setLoading(false);
      return;
    }

    setExtensionsOk(ext);
    setNodes(rows.map((r) => mapRowToWorkspaceNode(r, ext)));
    if (!projRes.error) setProjects((projRes.data as ProjectPick[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    getCurrentProfile().then((p) => {
      setMyRole(p?.role ?? null);
      const id = p?.id ?? null;
      setUserId(id);
      if (id) void loadPrefs(id);
    });
  }, [loadPrefs]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) setSelectedSpaceId(spaces[0].id);
    if (selectedSpaceId && !spaces.some((s) => s.id === selectedSpaceId)) setSelectedSpaceId(spaces[0]?.id ?? null);
  }, [spaces, selectedSpaceId]);

  const nodesInSpace = useMemo(() => nodes.filter((n) => n.space_id === selectedSpaceId), [nodes, selectedSpaceId]);
  const selectedSpace = spaces.find((s) => s.id === selectedSpaceId) ?? null;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      setUserPrefs((p) => { const merged = { ...p, treeExpanded: next }; debounceSavePrefs(merged); return merged; });
      return next;
    });
  }

  async function handleDeleteSpace(id: string) {
    if (!podeGerirEspacos) return;
    if (!window.confirm("Excluir este espaço e todo o conteúdo?")) return;
    const { error } = await supabase.from("workspace_spaces").delete().eq("id", id);
    if (error) { showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error)); return; }
    if (selectedSpaceId === id) setSelectedSpaceId(null);
    showSuccessToast("Espaço removido");
    await loadAll();
  }

  async function handleUpdateSpace(id: string, patch: Partial<Pick<WorkspaceSpace, "name" | "color" | "icon">>) {
    if (!podeGerirEspacos) return;
    if (patch.name !== undefined && !String(patch.name).trim()) { showErrorToast("Informe um nome para o espaço."); return; }
    const { error } = await supabase.from("workspace_spaces").update(patch).eq("id", id);
    if (error) { showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error)); return; }
    showSuccessToast("Espaço atualizado");
    await loadAll();
  }

  async function createNode(name: string, kind: "folder" | "list", parentId: string | null) {
    if (!selectedSpaceId || !podeEditarNos || !name.trim()) return;
    const sibs = siblingsOf(nodes, selectedSpaceId, parentId);
    const nextOrder = sibs.length > 0 ? Math.max(...sibs.map((x) => x.sort_order)) + 1 : 0;
    const insert: Record<string, unknown> = { space_id: selectedSpaceId, parent_id: parentId, kind, name: name.trim(), sort_order: nextOrder, color: null, project_id: null };
    if (extensionsOk) { insert.default_view = "list"; insert.custom_field_definitions = []; }
    const { error } = await supabase.from("workspace_space_nodes").insert(insert);
    if (error) { showErrorToast("Não foi possível criar", getSupabaseErrorMessage(error)); return; }
    showSuccessToast(kind === "folder" ? "Pasta criada" : "Lista criada");
    setAddingNode(null);
    await loadAll();
  }

  async function createListFromProject(project: ProjectPick) {
    if (!selectedSpaceId || !podeEditarNos) return;
    const parentId = projectPickerParentId;
    setProjectPickerOpen(false);
    setProjectPickerParentId(null);
    const sibs = siblingsOf(nodes, selectedSpaceId, parentId);
    const nextOrder = sibs.length > 0 ? Math.max(...sibs.map((x) => x.sort_order)) + 1 : 0;
    const insert: Record<string, unknown> = {
      space_id: selectedSpaceId,
      parent_id: parentId,
      kind: "list",
      name: project.name,
      sort_order: nextOrder,
      color: null,
      project_id: project.id,
    };
    if (extensionsOk) { insert.default_view = "list"; insert.custom_field_definitions = []; }
    const { error } = await supabase.from("workspace_space_nodes").insert(insert);
    if (error) { showErrorToast("Não foi possível adicionar projeto", getSupabaseErrorMessage(error)); return; }
    const parentName = parentId ? nodes.find((n) => n.id === parentId)?.name : null;
    showSuccessToast(`Projeto "${project.name}" adicionado${parentName ? ` em "${parentName}"` : ""}`);
    // Expand the parent folder automatically
    if (parentId) setExpandedFolders((prev) => ({ ...prev, [parentId]: true }));
    await loadAll();
  }

  // Legacy wrapper mantida para compatibilidade com SettingsPanel (onAddChild)
  function addNode(kind: "folder" | "list", parentId: string | null) {
    setAddingNode({ kind, parentId });
  }

  async function updateNodePatch(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("workspace_space_nodes").update(patch).eq("id", id);
    if (error) { showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error)); return; }
    await loadAll();
  }

  async function handleDeleteNode(id: string) {
    if (!podeEditarNos) return;
    if (!window.confirm("Excluir este item e todo o conteúdo interno?")) return;
    const { error } = await supabase.from("workspace_space_nodes").delete().eq("id", id);
    if (error) { showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error)); return; }
    if (selectedNodeId === id) setSelectedNodeId(null);
    await loadAll();
  }

  async function moveNode(node: WorkspaceNode, dir: -1 | 1) {
    if (!podeEditarNos) return;
    const sibs = siblingsOf(nodes, node.space_id, node.parent_id);
    const idx = sibs.findIndex((s) => s.id === node.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sibs.length) return;
    const a = sibs[idx];
    const b = sibs[swapIdx];
    await supabase.from("workspace_space_nodes").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("workspace_space_nodes").update({ sort_order: a.sort_order }).eq("id", b.id);
    await loadAll();
  }

  const detailProject = selectedNode?.projects;
  const saneHref =
    detailProject && projectQualifiesForSaneamentoModule(detailProject.discipline, detailProject.sanitation_type)
      ? `/saneamento/${detailProject.id}`
      : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Schema banner */}
      {schemaBanner && (
        <div
          className="mb-4 p-3 rounded-lg text-sm font-semibold"
          style={{ background: "var(--warning-soft)", color: "var(--warning-fg)", border: "1px solid var(--warning)" }}
        >
          {schemaBanner}
        </div>
      )}

      {/* Extensions hint */}
      {!schemaBanner && !extensionsOk && spaces.length > 0 && (
        <div className="mb-3 p-3 rounded-lg text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <strong>Extensões opcionais:</strong> execute{" "}
          <code className="text-xs">lib/sql/workspaces-spaces-extensions.sql</code> para ativar itens, Kanban e campos customizados.
        </div>
      )}

      {/* Main layout */}
      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          height: "calc(100vh - 180px)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* ── LEFT SIDEBAR ── */}
        <div
          style={{
            width: 248,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-fg)" }}>
              Espaços
            </span>
            {podeGerirEspacos && !schemaBanner && (
              <button
                type="button"
                onClick={() => setAddSpaceOpen(true)}
                title="Novo espaço"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--muted-fg)",
                  display: "flex",
                  alignItems: "center",
                  padding: 3,
                  borderRadius: 5,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface)"; e.currentTarget.style.color = "var(--primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted-fg)"; }}
              >
                <Plus size={14} />
              </button>
            )}
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 4px" }}>
            {loading && <p className="text-xs text-muted px-3 py-2">Carregando…</p>}

            {!loading && spaces.length === 0 && !schemaBanner && (
              <div style={{ padding: "16px 12px", textAlign: "center" }}>
                <p className="text-xs text-muted">Nenhum espaço ainda.</p>
                {podeGerirEspacos && (
                  <button
                    type="button"
                    onClick={() => setAddSpaceOpen(true)}
                    className="text-xs font-semibold"
                    style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", marginTop: 6 }}
                  >
                    + Criar primeiro espaço
                  </button>
                )}
              </div>
            )}

            {spaces.map((s) => {
              const isSelected = selectedSpaceId === s.id;
              const spaceNodes = nodes.filter((n) => n.space_id === s.id);

              return (
                <div key={s.id}>
                  {/* Space row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0,
                      borderRadius: 6,
                      background: isSelected ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "transparent",
                      border: `1px solid ${isSelected ? "color-mix(in srgb, var(--primary) 25%, transparent)" : "transparent"}`,
                      marginBottom: 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSpaceId(s.id);
                        setSelectedNodeId(null);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        flex: 1,
                        minWidth: 0,
                        padding: "6px 8px",
                        textAlign: "left",
                      }}
                    >
                      <SpaceGlyph icon={s.icon} color={s.color} size={13} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? "var(--foreground)" : "var(--muted-fg)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {s.name}
                      </span>
                    </button>

                    {podeGerirEspacos && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleDeleteSpace(s.id); }}
                        title="Excluir espaço"
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: "4px 6px", borderRadius: 4, flexShrink: 0, opacity: 0 }}
                        className="delete-space-btn"
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.opacity = "1"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-fg)"; e.currentTarget.style.opacity = "0"; }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>

                  {/* Tree when space is selected */}
                  {isSelected && spaceNodes.length > 0 && (
                    <div style={{ marginLeft: 8, marginBottom: 4 }}>
                      <SidebarTree
                        nodes={spaceNodes}
                        spaceId={s.id}
                        selectedNodeId={selectedNodeId}
                        expandedFolders={expandedFolders}
                        onToggleFolder={toggleFolder}
                        onSelectNode={setSelectedNodeId}
                        podeEditar={podeEditarNos}
                        onMoveUpDown={(node, dir) => void moveNode(node as WorkspaceNode, dir)}
                        onAddChild={(kind, parentId) => setAddingNode({ kind, parentId })}
                        onAddProject={(folderId) => { setProjectPickerParentId(folderId); setProjectPickerOpen(true); }}
                        onDeleteNode={(id) => void handleDeleteNode(id)}
                      />
                    </div>
                  )}

                  {/* Inline add node form */}
                  {isSelected && addingNode && (
                    <InlineNodeInput
                      kind={addingNode.kind}
                      parentId={addingNode.parentId}
                      nodes={spaceNodes}
                      onConfirm={(name) => void createNode(name, addingNode.kind, addingNode.parentId)}
                      onCancel={() => setAddingNode(null)}
                    />
                  )}

                  {/* Add folder/list/project buttons */}
                  {isSelected && podeEditarNos && !addingNode && (
                    <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1">
                      <AddNodeBtn
                        kind="folder"
                        label="Pasta"
                        onClick={() => setAddingNode({ kind: "folder", parentId: null })}
                      />
                      <AddNodeBtn
                        kind="list"
                        label="Lista"
                        onClick={() => setAddingNode({ kind: "list", parentId: null })}
                      />
                      <AddNodeBtn
                        kind="project"
                        label="Projeto"
                        onClick={() => setProjectPickerOpen(true)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface)" }}>
          {!selectedSpace ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <EmptyState
                title="Selecione um espaço"
                description={podeGerirEspacos ? "Escolha um espaço à esquerda ou clique em + para criar." : "Escolha um espaço na navegação à esquerda."}
              />
            </div>
          ) : (
            <>
              {/* Content header */}
              <div
                style={{
                  padding: "10px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  flexShrink: 0,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Breadcrumb */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <SpaceGlyph icon={selectedSpace.icon} color={selectedSpace.color} size={15} />
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                      {selectedSpace.name}
                    </span>
                    {selectedNode && (
                      <>
                        <ChevronRight size={13} style={{ color: "var(--muted-fg)", flexShrink: 0 }} />
                        <span
                          className="text-sm truncate"
                          style={{ color: "var(--muted-fg)", fontWeight: 500 }}
                        >
                          {selectedNode.name}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(podeGerirEspacos || (podeEditarNos && selectedNode)) && (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(true)}
                        title="Configurações"
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: "var(--muted-fg)",
                          display: "flex",
                          alignItems: "center",
                          padding: "4px 8px",
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted-fg)"; }}
                      >
                        <Settings size={13} /> Configurar
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Content body */}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {!selectedNode ? (
                  /* Space overview — todos os nós raiz (pastas + listas) */
                  <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
                    {(() => {
                      const rootNodes = nodesInSpace
                        .filter((n) => n.parent_id === null)
                        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));

                      if (rootNodes.length === 0) {
                        return (
                          <div>
                            <EmptyState
                              title="Espaço vazio"
                              description={podeEditarNos ? "Adicione pastas ou listas usando os botões abaixo." : "Nenhum item criado ainda."}
                            />
                            {podeEditarNos && (
                              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
                                <Button size="sm" variant="secondary" leftIcon={<Folder size={13} />} onClick={() => setAddingNode({ kind: "folder", parentId: null })}>Nova pasta</Button>
                                <Button size="sm" variant="secondary" leftIcon={<ListTodo size={13} />} onClick={() => setAddingNode({ kind: "list", parentId: null })}>Nova lista</Button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                          {rootNodes.map((node) => {
                            const isFolder = node.kind === "folder";
                            const nodeColor = node.color || (isFolder ? "var(--warning)" : "var(--primary)");
                            const childCount = isFolder ? nodesInSpace.filter((n) => n.parent_id === node.id).length : null;
                            return (
                              <button
                                key={node.id}
                                type="button"
                                onClick={() => {
                                  setSelectedNodeId(node.id);
                                  if (isFolder) setExpandedFolders((prev) => ({ ...prev, [node.id]: true }));
                                }}
                                style={{
                                  background: "var(--surface-2)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "var(--radius-md)",
                                  padding: "14px 16px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  textAlign: "left",
                                  transition: "all 0.15s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--surface)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
                              >
                                {isFolder
                                  ? <Folder size={20} style={{ color: nodeColor, flexShrink: 0 }} />
                                  : <ListTodo size={20} style={{ color: nodeColor, flexShrink: 0 }} />
                                }
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold truncate">{node.name}</div>
                                  <div className="text-xs text-muted">
                                    {isFolder
                                      ? (childCount! > 0 ? `${childCount} ${childCount === 1 ? "item" : "itens"}` : "Pasta")
                                      : "Lista"
                                    }
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                ) : selectedNode.kind === "folder" ? (() => {
                  /* Folder view:
                   * - coleta todos os project_ids descendentes (listas filhas com projeto)
                   * - se houver → exibe o ProjectTaskBoard (Quadro/Lista/Gantt)
                   * - se não houver → exibe grade com os filhos diretos da pasta
                   */
                  const collectProjectIds = (parentId: string): string[] => {
                    const ids: string[] = [];
                    nodesInSpace.filter((n) => n.parent_id === parentId).forEach((child) => {
                      if (child.kind === "list" && child.project_id) ids.push(child.project_id);
                      else if (child.kind === "folder") ids.push(...collectProjectIds(child.id));
                    });
                    return ids;
                  };
                  const folderProjectIds = collectProjectIds(selectedNode.id);

                  // ── Pasta COM projetos → board de tarefas ───────────────────
                  if (folderProjectIds.length > 0) {
                    return (
                      <ProjectTaskBoard
                        projectIds={folderProjectIds}
                        nodeLabel={selectedNode.name}
                        podeEditar={podeEditarNos}
                      />
                    );
                  }

                  // ── Pasta SEM projetos → grade de filhos diretos ────────────
                  const childNodes = nodesInSpace
                    .filter((n) => n.parent_id === selectedNode.id)
                    .sort((a, b) => a.sort_order - b.sort_order);

                  return (
                    <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
                      {childNodes.length === 0 ? (
                        <EmptyState
                          title="Pasta vazia"
                          description={podeEditarNos ? "Adicione subpastas ou listas usando os botões na barra lateral." : "Nenhum item nesta pasta."}
                        />
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                          {childNodes.map((child) => {
                            const isChildFolder = child.kind === "folder";
                            const childColor = child.color || (isChildFolder ? "var(--warning)" : "var(--primary)");
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={() => {
                                  setSelectedNodeId(child.id);
                                  if (isChildFolder) setExpandedFolders((prev) => ({ ...prev, [child.id]: true }));
                                }}
                                style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left", transition: "all 0.15s" }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--surface)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
                              >
                                {isChildFolder
                                  ? <Folder size={18} style={{ color: childColor, flexShrink: 0 }} />
                                  : <ListTodo size={18} style={{ color: childColor, flexShrink: 0 }} />
                                }
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-semibold truncate">{child.name}</div>
                                  <div className="text-xs text-muted">{isChildFolder ? "Pasta" : "Lista"}</div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })() : selectedNode.project_id ? (
                  /* List with linked project → show task board */
                  <ProjectTaskBoard
                    projectIds={[selectedNode.project_id]}
                    nodeLabel={selectedNode.name}
                    podeEditar={podeEditarNos}
                  />
                ) : (
                  /* List without project → show workspace list items */
                  <ListItemsSection
                    listNodeId={selectedNode.id}
                    projectId={null}
                    enabled={extensionsOk}
                    defaultView={(selectedNode.default_view as WorkspaceViewMode) || "list"}
                    userViewMode={userPrefs.listViewByNode?.[selectedNode.id] ?? null}
                    onUserViewModeChange={(mode) => {
                      setUserPrefs((p) => {
                        const merged = { ...p, listViewByNode: { ...p.listViewByNode, [selectedNode.id]: mode } };
                        debounceSavePrefs(merged);
                        return merged;
                      });
                    }}
                    kanbanColumnsRaw={selectedNode.kanban_columns}
                    customFieldDefs={selectedNode.custom_field_definitions ?? []}
                    podeEditarItens={podeEditarNos || myRole === "projetista" || myRole === "employee"}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          space={selectedSpace}
          node={selectedNode}
          projects={projects}
          extensionsOk={extensionsOk}
          podeGerirEspacos={podeGerirEspacos}
          podeEditar={podeEditarNos}
          onClose={() => setSettingsOpen(false)}
          onSaveSpace={(id, patch) => { void handleUpdateSpace(id, patch); setSettingsOpen(false); }}
          onPatchNode={(patch) => selectedNode && void updateNodePatch(selectedNode.id, patch)}
          onDeleteNode={() => { void handleDeleteNode(selectedNode!.id); setSettingsOpen(false); }}
          onAddChild={(kind, parentId) => void addNode(kind, parentId)}
          saneHref={saneHref}
        />
      )}

      {/* Add space modal */}
      {addSpaceOpen && (
        <AddSpaceModal
          nextSortOrder={spaces.length > 0 ? Math.max(...spaces.map((s) => s.sort_order)) + 1 : 0}
          onClose={() => setAddSpaceOpen(false)}
          onCreated={(id) => {
            setAddSpaceOpen(false);
            void loadAll().then(() => setSelectedSpaceId(id));
          }}
        />
      )}

      {/* Project picker modal */}
      {projectPickerOpen && selectedSpaceId && (
        <ProjectPickerModal
          projects={projects}
          linkedProjectIds={
            new Set(
              nodesInSpace
                .filter((n) => n.project_id)
                .map((n) => n.project_id!)
            )
          }
          parentFolderName={projectPickerParentId ? (nodesInSpace.find((n) => n.id === projectPickerParentId)?.name ?? null) : null}
          onClose={() => { setProjectPickerOpen(false); setProjectPickerParentId(null); }}
          onSelect={(project) => void createListFromProject(project)}
        />
      )}
    </div>
  );
}
