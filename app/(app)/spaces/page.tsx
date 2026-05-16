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
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage, logSupabaseUnlessJwt } from "@/lib/supabase/errors";
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
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { WorkspaceTreeDnD } from "@/components/spaces/workspace-tree";
import { ListItemsSection } from "@/components/spaces/list-items-section";
import { KanbanColumnsEditor } from "@/components/spaces/kanban-columns-editor";

type UserPrefsPayload = {
  treeExpanded?: Record<string, boolean>;
  listViewByNode?: Record<string, WorkspaceViewMode>;
};

const NODE_SELECT_EXTENDED =
  "id, space_id, parent_id, kind, name, color, sort_order, project_id, default_view, custom_field_definitions, kanban_columns, projects(id, name, municipality, state, discipline, sanitation_type)";

const NODE_SELECT_BASIC =
  "id, space_id, parent_id, kind, name, color, sort_order, project_id, projects(id, name, municipality, state, discipline, sanitation_type)";

function isColumnMissingError(err: unknown): boolean {
  const m = getSupabaseErrorMessage(err).toLowerCase();
  return (
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find")
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
  if (Array.isArray(raw)) {
    const row = raw[0] as ProjectEmbed | undefined;
    return row ?? null;
  }
  return raw as ProjectEmbed;
}

const COLOR_PRESETS = [
  "#6366f1",
  "#0d9488",
  "#2563eb",
  "#c026d3",
  "#ea580c",
  "#ca8a04",
  "#4f46e5",
  "#64748b",
] as const;

const SPACE_ICON_KEYS = [
  "layers",
  "building2",
  "briefcase",
  "factory",
  "map",
  "home",
  "grid",
  "sparkles",
] as const;

const SPACE_ICON_MAP: Record<string, LucideIcon> = {
  layers: Layers,
  building2: Building2,
  briefcase: Briefcase,
  factory: Factory,
  map: MapPin,
  home: Home,
  grid: Grid3x3,
  sparkles: Sparkles,
};

function SpaceGlyph({ icon, color, size = 16 }: { icon: string; color: string; size?: number }) {
  const Icon = SPACE_ICON_MAP[icon] ?? Layers;
  return <Icon size={size} style={{ color }} />;
}

function normalizePickerHex(v: string): string {
  const s = v.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (!/^#[0-9A-Fa-f]{3}$/i.test(s)) return "#6366f1";
  const x = s.slice(1);
  return `#${x[0]}${x[0]}${x[1]}${x[1]}${x[2]}${x[2]}`.toLowerCase();
}

function SpaceColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const pickerHex = normalizePickerHex(value);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {COLOR_PRESETS.map((c) => {
          const active = value.toLowerCase() === c.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className="shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              style={{
                width: 30,
                height: 30,
                background: c,
                border: active
                  ? "3px solid var(--foreground)"
                  : "2px solid color-mix(in srgb, var(--border) 80%, transparent)",
                boxShadow: active ? "0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent)" : undefined,
              }}
              aria-label={`Cor ${c}`}
              aria-pressed={active}
            />
          );
        })}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <label
          className="relative flex h-10 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]"
          title="Cor personalizada"
        >
          <input
            type="color"
            value={pickerHex}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Abrir seletor de cor"
          />
          <span className="pointer-events-none absolute inset-0" style={{ background: pickerHex }} />
        </label>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 font-mono text-xs"
          placeholder="#6366f1"
          spellCheck={false}
        />
      </div>
    </div>
  );
}

function SpaceIconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {SPACE_ICON_KEYS.map((k) => {
        const Icon = SPACE_ICON_MAP[k] ?? Layers;
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className="flex flex-col items-center gap-1 rounded-xl border p-2 transition-all hover:border-[var(--primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            style={{
              borderColor: active ? "var(--primary)" : "var(--border)",
              background: active ? "color-mix(in srgb, var(--primary) 16%, var(--surface))" : "var(--surface)",
              boxShadow: active ? "inset 0 1px 0 rgba(255, 255, 255, 0.06)" : undefined,
            }}
            aria-label={`Ícone ${k}`}
            aria-pressed={active}
          >
            <Icon size={22} style={{ color: active ? "var(--primary)" : "var(--muted-fg)" }} />
            <span
              className="w-full truncate text-center text-[9px] font-semibold leading-tight"
              style={{ color: active ? "var(--foreground)" : "var(--muted-fg)" }}
            >
              {k}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function schemaLikelyMissing(err: unknown): boolean {
  const s = getSupabaseErrorMessage(err).toLowerCase();
  return (
    s.includes("workspace_spaces") ||
    s.includes("workspace_space_nodes") ||
    s.includes("workspace_list_items") ||
    s.includes("user_workspace_prefs") ||
    s.includes("does not exist") ||
    s.includes("não existe") ||
    (s.includes("relation") && s.includes("exist"))
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
    default_view:
      extensionsOk && r.default_view === "kanban" ? "kanban" : extensionsOk ? "list" : undefined,
    custom_field_definitions: extensionsOk
      ? parseCustomFieldDefs(r.custom_field_definitions)
      : undefined,
    kanban_columns: extensionsOk ? r.kanban_columns : undefined,
  };
}

function siblingsOf(
  nodes: WorkspaceNode[],
  spaceId: string,
  parentId: string | null
): WorkspaceNode[] {
  return nodes
    .filter((n) => n.space_id === spaceId && n.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
}

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

  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceColor, setNewSpaceColor] = useState<string>(COLOR_PRESETS[0]);
  const [newSpaceIcon, setNewSpaceIcon] = useState<string>("layers");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [extensionsOk, setExtensionsOk] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [userPrefs, setUserPrefs] = useState<UserPrefsPayload>({});
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
        {
          user_id: uid,
          prefs: payload as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) logSupabaseUnlessJwt("[spaces] prefs", error);
    }, 450);
  }, []);

  const loadPrefs = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("user_workspace_prefs")
      .select("prefs")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) {
      if (!schemaLikelyMissing(error)) logSupabaseUnlessJwt("[spaces] prefs load", error);
      return;
    }
    const p = (data?.prefs || {}) as UserPrefsPayload;
    setUserPrefs(p);
    if (p.treeExpanded && Object.keys(p.treeExpanded).length > 0) {
      setExpandedFolders(p.treeExpanded);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setSchemaBanner(null);
    setExtensionsOk(false);
    await ensureFreshSupabaseSession();

    const [spRes, projRes] = await Promise.all([
      supabase.from("workspace_spaces").select("*").order("sort_order").order("name"),
      supabase
        .from("projects")
        .select("id, name, municipality, state, discipline, sanitation_type")
        .order("name"),
    ]);

    if (spRes.error) {
      if (schemaLikelyMissing(spRes.error)) {
        setSchemaBanner(
          "As tabelas de Espaços ainda não existem. Execute lib/sql/workspaces-spaces.sql no Supabase. Para Kanban, itens e campos customizados, execute também lib/sql/workspaces-spaces-extensions.sql."
        );
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
      if (projRes.error) {
        logSupabaseUnlessJwt("[spaces] projects", projRes.error);
        setProjects([]);
      } else {
        setProjects((projRes.data as ProjectPick[]) || []);
      }
      setLoading(false);
      return;
    }

    let ext = true;
    const resExt = await supabase
      .from("workspace_space_nodes")
      .select(NODE_SELECT_EXTENDED)
      .in("space_id", sidList)
      .order("sort_order")
      .order("name");

    let rows: Array<Record<string, unknown>> = [];

    if (!resExt.error) {
      rows = (resExt.data || []) as Array<Record<string, unknown>>;
    } else if (isColumnMissingError(resExt.error)) {
      ext = false;
      const resBasic = await supabase
        .from("workspace_space_nodes")
        .select(NODE_SELECT_BASIC)
        .in("space_id", sidList)
        .order("sort_order")
        .order("name");
      if (resBasic.error) {
        logSupabaseUnlessJwt("[spaces] nodes", resBasic.error);
        showErrorToast("Não foi possível carregar pastas/listas", getSupabaseErrorMessage(resBasic.error));
        setNodes([]);
        setExtensionsOk(false);
        if (projRes.error) {
          logSupabaseUnlessJwt("[spaces] projects", projRes.error);
          setProjects([]);
        } else {
          setProjects((projRes.data as ProjectPick[]) || []);
        }
        setLoading(false);
        return;
      }
      rows = (resBasic.data || []) as Array<Record<string, unknown>>;
    } else {
      logSupabaseUnlessJwt("[spaces] nodes", resExt.error);
      showErrorToast("Não foi possível carregar pastas/listas", getSupabaseErrorMessage(resExt.error));
      setNodes([]);
      setExtensionsOk(false);
      if (projRes.error) {
        logSupabaseUnlessJwt("[spaces] projects", projRes.error);
        setProjects([]);
      } else {
        setProjects((projRes.data as ProjectPick[]) || []);
      }
      setLoading(false);
      return;
    }

    setExtensionsOk(ext);
    setNodes(rows.map((r) => mapRowToWorkspaceNode(r, ext)));

    if (projRes.error) {
      logSupabaseUnlessJwt("[spaces] projects", projRes.error);
      setProjects([]);
    } else {
      setProjects((projRes.data as ProjectPick[]) || []);
    }

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

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) setSelectedSpaceId(spaces[0].id);
    if (selectedSpaceId && !spaces.some((s) => s.id === selectedSpaceId)) {
      setSelectedSpaceId(spaces[0]?.id ?? null);
    }
  }, [spaces, selectedSpaceId]);

  const nodesInSpace = useMemo(
    () => nodes.filter((n) => n.space_id === selectedSpaceId),
    [nodes, selectedSpaceId]
  );

  const selectedSpace = spaces.find((s) => s.id === selectedSpaceId) ?? null;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function toggleFolder(id: string) {
    setExpandedFolders((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      setUserPrefs((p) => {
        const merged = { ...p, treeExpanded: next };
        debounceSavePrefs(merged);
        return merged;
      });
      return next;
    });
  }

  async function handleCreateSpace() {
    if (!newSpaceName.trim() || !podeGerirEspacos) return;
    setCreatingSpace(true);
    const profile = await getCurrentProfile();
    const nextOrder =
      spaces.length > 0 ? Math.max(...spaces.map((s) => s.sort_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("workspace_spaces")
      .insert({
        name: newSpaceName.trim(),
        color: newSpaceColor,
        icon: newSpaceIcon,
        sort_order: nextOrder,
        created_by: profile?.id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      if (schemaLikelyMissing(error)) {
        setSchemaBanner(
          "Execute lib/sql/workspaces-spaces.sql no Supabase para habilitar Espaços."
        );
      } else {
        showErrorToast("Não foi possível criar o espaço", getSupabaseErrorMessage(error));
      }
      setCreatingSpace(false);
      return;
    }

    setNewSpaceName("");
    showSuccessToast("Espaço criado", "Adicione pastas e listas na árvore à esquerda.");
    await loadAll();
    if (data?.id) setSelectedSpaceId(data.id);
    setCreatingSpace(false);
  }

  async function handleDeleteSpace(id: string) {
    if (!podeGerirEspacos) return;
    if (!window.confirm("Excluir este espaço e todo o conteúdo (pastas e listas)?")) return;
    const { error } = await supabase.from("workspace_spaces").delete().eq("id", id);
    if (error) {
      showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error));
      return;
    }
    if (selectedSpaceId === id) setSelectedSpaceId(null);
    showSuccessToast("Espaço removido", "");
    await loadAll();
  }

  async function handleUpdateSpace(
    id: string,
    patch: Partial<Pick<WorkspaceSpace, "name" | "color" | "icon">>
  ) {
    if (!podeGerirEspacos) return;
    if (patch.name !== undefined && !String(patch.name).trim()) {
      showErrorToast("Nome inválido", "Informe um nome para o espaço.");
      return;
    }
    const { error } = await supabase.from("workspace_spaces").update(patch).eq("id", id);
    if (error) {
      showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast("Espaço atualizado", "");
    await loadAll();
  }

  async function addNode(kind: "folder" | "list", parentId: string | null) {
    if (!selectedSpaceId || !podeEditarNos) return;
    const name =
      kind === "folder"
        ? window.prompt("Nome da pasta:", "Nova pasta")
        : window.prompt("Nome da lista:", "Nova lista");
    if (!name?.trim()) return;

    const sibs = siblingsOf(nodes, selectedSpaceId, parentId);
    const nextOrder = sibs.length > 0 ? Math.max(...sibs.map((x) => x.sort_order)) + 1 : 0;

    const insert: Record<string, unknown> = {
      space_id: selectedSpaceId,
      parent_id: parentId,
      kind,
      name: name.trim(),
      sort_order: nextOrder,
      color: null,
      project_id: null,
    };
    if (extensionsOk) {
      insert.default_view = "list";
      insert.custom_field_definitions = [];
    }

    const { error } = await supabase.from("workspace_space_nodes").insert(insert);

    if (error) {
      showErrorToast("Não foi possível criar", getSupabaseErrorMessage(error));
      return;
    }
    showSuccessToast(kind === "folder" ? "Pasta criada" : "Lista criada", "");
    await loadAll();
  }

  async function updateNodePatch(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("workspace_space_nodes").update(patch).eq("id", id);
    if (error) {
      showErrorToast("Não foi possível salvar", getSupabaseErrorMessage(error));
      return;
    }
    await loadAll();
  }

  async function handleDeleteNode(id: string) {
    if (!podeEditarNos) return;
    if (!window.confirm("Excluir este item e todo o conteúdo interno?")) return;
    const { error } = await supabase.from("workspace_space_nodes").delete().eq("id", id);
    if (error) {
      showErrorToast("Não foi possível excluir", getSupabaseErrorMessage(error));
      return;
    }
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

  async function applyDropMove(draggedId: string, targetId: string, placement: TreePlacement) {
    if (!podeEditarNos || !selectedSpaceId) return;

    let updates: { id: string; parent_id: string | null; sort_order: number }[] | null = null;
    if (targetId === "__root__") {
      updates = computeMoveToRootEnd(nodes, selectedSpaceId, draggedId);
    } else {
      updates = computeTreeMove(nodes, selectedSpaceId, draggedId, targetId, placement);
    }
    if (!updates?.length) return;

    const dragged = nodes.find((n) => n.id === draggedId);
    if (!dragged) return;

    const newParentForDragged = updates.find((u) => u.id === draggedId)?.parent_id ?? null;
    const patches = [...updates];

    if (dragged.parent_id !== newParentForDragged) {
      const oldSibs = siblingsOf(nodes, dragged.space_id, dragged.parent_id).filter(
        (n) => n.id !== draggedId
      );
      oldSibs.forEach((n, i) => {
        patches.push({ id: n.id, parent_id: dragged.parent_id, sort_order: i });
      });
    }

    await Promise.all(
      patches.map((p) =>
        supabase
          .from("workspace_space_nodes")
          .update({ parent_id: p.parent_id, sort_order: p.sort_order })
          .eq("id", p.id)
      )
    );
    await loadAll();
  }

  const detailProject = selectedNode?.projects;
  const saneHref =
    detailProject &&
    projectQualifiesForSaneamentoModule(detailProject.discipline, detailProject.sanitation_type)
      ? `/saneamento/${detailProject.id}`
      : null;

  return (
    <div>
      <PageHeader
        title="Espaços"
        description="Organize o portfólio em espaços, pastas e listas — semelhante ao ClickUp. Listas podem apontar para um projeto existente."
        actions={
          podeGerirEspacos ? (
            <Button leftIcon={<Plus size={16} />} onClick={() => void loadAll()} variant="secondary">
              Atualizar
            </Button>
          ) : undefined
        }
      />

      {schemaBanner && (
        <Card className="mb-4 p-4" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}>
          <p className="text-sm" style={{ fontWeight: 600, color: "var(--warning-fg)", margin: 0 }}>
            {schemaBanner}
          </p>
        </Card>
      )}

      {!schemaBanner && !extensionsOk && spaces.length > 0 && (
        <Card className="mb-4 p-3" style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}>
          <p className="text-sm text-muted m-0">
            <strong className="text-foreground">Extensões opcionais:</strong> execute{" "}
            <code className="text-xs">lib/sql/workspaces-spaces-extensions.sql</code> no Supabase para
            ativar itens nas listas, quadro Kanban, campos customizados e preferências pessoais de vista.
          </p>
        </Card>
      )}

      <div
        className="flex gap-4 flex-col lg:flex-row"
        style={{ alignItems: "stretch", minHeight: "min(70vh, 720px)" }}
      >
        <Card
          className="p-0 overflow-hidden flex flex-col"
          style={{
            flex: "0 0 min(100%, 320px)",
            maxHeight: "80vh",
          }}
        >
          <div
            className="p-3 border-b flex items-center justify-between gap-2"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Espaços</span>
          </div>
          <div className="overflow-y-auto flex-1 p-2" style={{ maxHeight: "calc(80vh - 56px)" }}>
            {loading && <p className="text-sm text-muted px-2">Carregando…</p>}
            {!loading && spaces.length === 0 && !schemaBanner && (
              <EmptyState
                title="Nenhum espaço ainda"
                description={
                  podeGerirEspacos
                    ? "Crie um espaço de topo (ex.: cliente ou área) e depois adicione pastas e listas."
                    : "Peça a um coordenador para criar o primeiro espaço."
                }
              />
            )}
            {spaces.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedSpaceId(s.id);
                  setSelectedNodeId(null);
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left mb-1"
                style={{
                  background:
                    selectedSpaceId === s.id
                      ? "color-mix(in srgb, var(--primary) 14%, var(--surface))"
                      : "transparent",
                  border: "1px solid",
                  borderColor:
                    selectedSpaceId === s.id ? "color-mix(in srgb, var(--primary) 35%, transparent)" : "transparent",
                }}
              >
                <SpaceGlyph icon={s.icon} color={s.color} />
                <span className="text-sm font-semibold truncate flex-1">{s.name}</span>
                {podeGerirEspacos && (
                  <Button
                    size="icon-sm"
                    variant="danger-ghost"
                    title="Excluir espaço"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteSpace(s.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                )}
              </button>
            ))}
          </div>

          {podeGerirEspacos && !schemaBanner && (
            <div
              className="p-3 border-t space-y-2"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <Field label="Novo espaço">
                <Input
                  value={newSpaceName}
                  onChange={(e) => setNewSpaceName(e.target.value)}
                  placeholder="Ex.: COPASA"
                />
              </Field>
              <Field label="Cor">
                <SpaceColorPicker value={newSpaceColor} onChange={setNewSpaceColor} />
              </Field>
              <Field label="Ícone">
                <SpaceIconPicker value={newSpaceIcon} onChange={setNewSpaceIcon} />
              </Field>
              <Button
                className="w-full"
                leftIcon={<Plus size={14} />}
                disabled={creatingSpace || !newSpaceName.trim()}
                onClick={() => void handleCreateSpace()}
              >
                Criar espaço
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex-1 p-0 overflow-hidden flex flex-col min-h-[420px]">
          {!selectedSpace ? (
            <div className="p-6">
              <EmptyState title="Selecione um espaço" description="Ou crie um novo na coluna à esquerda." />
            </div>
          ) : (
            <>
              <div
                className="p-4 border-b flex flex-wrap items-center justify-between gap-2"
                style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <SpaceGlyph icon={selectedSpace.icon} color={selectedSpace.color} size={22} />
                  <div className="min-w-0">
                    <div className="text-lg font-bold truncate">{selectedSpace.name}</div>
                    <div className="text-xs text-muted">
                      Pastas agrupam listas; listas podem vincular um projeto.
                    </div>
                  </div>
                </div>
                {podeEditarNos && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" leftIcon={<Folder size={14} />} onClick={() => void addNode("folder", null)}>
                      Pasta na raiz
                    </Button>
                    <Button size="sm" leftIcon={<ListTodo size={14} />} onClick={() => void addNode("list", null)}>
                      Lista na raiz
                    </Button>
                  </div>
                )}
              </div>
              {podeGerirEspacos && (
                <SpaceEditor
                  space={selectedSpace}
                  onSave={(id, patch) => void handleUpdateSpace(id, patch)}
                />
              )}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col lg:flex-row gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold uppercase text-muted mb-2">Árvore</div>
                  {nodesInSpace.length === 0 ? (
                    <p className="text-sm text-muted">Nenhuma pasta ou lista. Adicione itens na raiz ou dentro de pastas.</p>
                  ) : selectedSpaceId ? (
                    <WorkspaceTreeDnD
                      nodes={nodesInSpace as WorkspaceTreeNode[]}
                      spaceId={selectedSpaceId}
                      selectedNodeId={selectedNodeId}
                      expandedFolders={expandedFolders}
                      onToggleFolder={toggleFolder}
                      onSelectNode={setSelectedNodeId}
                      podeEditar={podeEditarNos}
                      onMoveUpDown={(node, dir) => void moveNode(node as WorkspaceNode, dir)}
                      onDropReorder={(from, to, p) => void applyDropMove(from, to, p)}
                    />
                  ) : null}
                </div>
                <div className="lg:border-l lg:pl-4 flex-1 min-w-0" style={{ borderColor: "var(--border)" }}>
                  {!selectedNode ? (
                    <p className="text-sm text-muted">Clique em uma pasta ou lista para ver detalhes e personalizar.</p>
                  ) : (
                    <>
                    <NodeInspector
                      node={selectedNode}
                      projects={projects}
                      extensionsOk={extensionsOk}
                      podeEditar={podeEditarNos}
                      onPatch={(patch) => void updateNodePatch(selectedNode.id, patch)}
                      onDelete={() => void handleDeleteNode(selectedNode.id)}
                      onAddChild={(kind, parentId) => void addNode(kind, parentId)}
                      saneHref={saneHref}
                    />
                    {selectedNode.kind === "list" && extensionsOk && (
                      <ListItemsSection
                        listNodeId={selectedNode.id}
                        enabled={extensionsOk}
                        defaultView={(selectedNode.default_view as WorkspaceViewMode) || "list"}
                        userViewMode={userPrefs.listViewByNode?.[selectedNode.id] ?? null}
                        onUserViewModeChange={(mode) => {
                          setUserPrefs((p) => {
                            const merged = {
                              ...p,
                              listViewByNode: { ...p.listViewByNode, [selectedNode.id]: mode },
                            };
                            debounceSavePrefs(merged);
                            return merged;
                          });
                        }}
                        kanbanColumnsRaw={selectedNode.kanban_columns}
                        customFieldDefs={selectedNode.custom_field_definitions ?? []}
                        podeEditarItens={podeEditarNos || myRole === "projetista" || myRole === "employee"}
                      />
                    )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function SpaceEditor({
  space,
  onSave,
}: {
  space: WorkspaceSpace;
  onSave: (id: string, patch: Partial<Pick<WorkspaceSpace, "name" | "color" | "icon">>) => void;
}) {
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState(space.color);
  const [icon, setIcon] = useState(space.icon);

  useEffect(() => {
    setName(space.name);
    setColor(space.color);
    setIcon(space.icon);
  }, [space.id, space.name, space.color, space.icon]);

  return (
    <div
      className="px-4 py-3 border-b"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="text-xs font-bold uppercase text-muted mb-2">Personalizar este espaço</div>
      <div className="space-y-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Cor">
            <SpaceColorPicker value={color} onChange={setColor} />
          </Field>
          <Field label="Ícone">
            <SpaceIconPicker value={icon} onChange={setIcon} />
          </Field>
        </div>
      </div>
      <Button
        className="mt-3"
        size="sm"
        onClick={() =>
          onSave(space.id, { name: name.trim() || space.name, color, icon })
        }
      >
        Salvar espaço
      </Button>
    </div>
  );
}

function NodeInspector({
  node,
  projects,
  extensionsOk,
  podeEditar,
  onPatch,
  onDelete,
  onAddChild,
  saneHref,
}: {
  node: WorkspaceNode;
  projects: ProjectPick[];
  extensionsOk: boolean;
  podeEditar: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onAddChild: (kind: "folder" | "list", parentId: string) => void;
  saneHref: string | null;
}) {
  const [name, setName] = useState(node.name);
  const [color, setColor] = useState(node.color || "");
  const [projectId, setProjectId] = useState(node.project_id || "");
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>(
    () => node.custom_field_definitions ?? []
  );

  useEffect(() => {
    setName(node.name);
    setColor(node.color || "");
    setProjectId(node.project_id || "");
    setCustomFields(node.custom_field_definitions ?? []);
  }, [node.id, node.name, node.color, node.project_id, node.custom_field_definitions]);

  const linked = node.projects;

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

  function saveCustomFields() {
    onPatch({ custom_field_definitions: customFields });
    showSuccessToast("Campos salvos", "");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-base font-bold m-0 flex items-center gap-2">
          {node.kind === "folder" ? <Folder size={18} /> : <ListTodo size={18} />}
          {node.kind === "folder" ? "Pasta" : "Lista"}
        </h3>
        {podeEditar && (
          <Button size="sm" variant="danger-ghost" leftIcon={<Trash2 size={14} />} onClick={onDelete}>
            Excluir
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <Field label="Nome">
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!podeEditar} />
            {podeEditar && (
              <Button onClick={() => onPatch({ name: name.trim() || node.name })}>Salvar</Button>
            )}
          </div>
        </Field>

        <Field label="Cor do item (opcional)">
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={color || ""} onChange={(e) => setColor(e.target.value)} disabled={!podeEditar}>
              <option value="">Padrão do tema</option>
              {COLOR_PRESETS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            {podeEditar && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onPatch({ color: color || null })}
              >
                Aplicar cor
              </Button>
            )}
          </div>
        </Field>

        {node.kind === "list" && extensionsOk && (
          <>
            <Field label="Vista padrão (equipe)">
              <Select
                value={node.default_view || "list"}
                onChange={(e) =>
                  onPatch({ default_view: e.target.value === "kanban" ? "kanban" : "list" })
                }
                disabled={!podeEditar}
              >
                <option value="list">Lista</option>
                <option value="kanban">Quadro (Kanban)</option>
              </Select>
              <p className="text-xs text-muted mt-1 m-0">
                Cada usuário pode alternar Lista/Quadro no painel abaixo; aqui define o padrão da lista.
              </p>
            </Field>

            <div className="mt-1">
              <KanbanColumnsEditor
                valueRaw={node.kanban_columns}
                podeEditar={podeEditar}
                onSave={(cols) => onPatch({ kanban_columns: cols })}
              />
            </div>
            <p className="text-xs text-muted mt-2 m-0">
              Arraste as colunas com as setas. A chave interna identifica o cartão no banco — evite mudá-la depois de criar itens.
            </p>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-muted">Campos customizados</span>
                {podeEditar && (
                  <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} onClick={addCustomField}>
                    Campo
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {customFields.map((f, i) => (
                  <div
                    key={f.id}
                    className="flex flex-wrap gap-2 items-end p-2 rounded-lg"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                  >
                    <Field label="Nome" className="flex-1 min-w-[120px] mb-0">
                      <Input
                        value={f.name}
                        onChange={(e) => updateField(i, { name: e.target.value })}
                        disabled={!podeEditar}
                      />
                    </Field>
                    <Field label="Tipo" className="w-32 mb-0">
                      <Select
                        value={f.type}
                        onChange={(e) =>
                          updateField(i, {
                            type: e.target.value as CustomFieldDef["type"],
                            options: e.target.value === "select" ? f.options ?? ["A", "B"] : undefined,
                          })
                        }
                        disabled={!podeEditar}
                      >
                        <option value="text">Texto</option>
                        <option value="number">Número</option>
                        <option value="date">Data</option>
                        <option value="select">Lista</option>
                      </Select>
                    </Field>
                    {f.type === "select" && (
                      <Field label="Opções (vírgula)" className="flex-1 min-w-[160px] mb-0">
                        <Input
                          value={(f.options || []).join(", ")}
                          onChange={(e) =>
                            updateField(i, {
                              options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          disabled={!podeEditar}
                          placeholder="A, B, C"
                        />
                      </Field>
                    )}
                    <span className="text-[10px] text-muted font-mono pb-2">id: {f.id}</span>
                    {podeEditar && (
                      <Button size="icon-sm" variant="danger-ghost" onClick={() => removeField(i)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {podeEditar && customFields.length > 0 && (
                <Button className="mt-2" size="sm" onClick={saveCustomFields}>
                  Salvar campos
                </Button>
              )}
            </div>
          </>
        )}

        {node.kind === "list" && (
          <Field label="Vincular projeto (opcional)">
            <div className="flex flex-col gap-2">
              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={!podeEditar}
              >
                <option value="">— Nenhum —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatProjectDisplayName(p)}
                  </option>
                ))}
              </Select>
              {podeEditar && (
                <Button
                  size="sm"
                  onClick={() => onPatch({ project_id: projectId || null })}
                  variant="secondary"
                >
                  Salvar vínculo
                </Button>
              )}
            </div>
          </Field>
        )}

        {node.kind === "list" && linked && (
          <Card className="p-3" style={{ background: "var(--surface-2)" }}>
            <div className="text-xs font-bold uppercase text-muted mb-1">Projeto vinculado</div>
            <div className="font-semibold">{formatProjectDisplayName(linked)}</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <Link href="/projects" className="inline-flex">
                <Button size="sm" variant="secondary" leftIcon={<ExternalLink size={14} />}>
                  Abrir Projetos
                </Button>
              </Link>
              {saneHref && (
                <Link href={saneHref}>
                  <Button size="sm" leftIcon={<ExternalLink size={14} />}>
                    Módulo saneamento
                  </Button>
                </Link>
              )}
            </div>
          </Card>
        )}

        {node.kind === "folder" && podeEditar && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" variant="secondary" leftIcon={<Folder size={14} />} onClick={() => onAddChild("folder", node.id)}>
              Subpasta
            </Button>
            <Button size="sm" leftIcon={<ListTodo size={14} />} onClick={() => onAddChild("list", node.id)}>
              Lista interna
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
