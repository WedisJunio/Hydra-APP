"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Layers,
  Folder,
  ListTodo,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Building2,
  Briefcase,
  Factory,
  MapPin,
  Home,
  Grid3x3,
  Sparkles,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { getSupabaseErrorMessage, logSupabaseUnlessJwt } from "@/lib/supabase/errors";
import { ensureFreshSupabaseSession } from "@/lib/supabase/session-refresh";
import { canEditWorkspaceNodes, canManageWorkspaceSpaces } from "@/lib/permissions";
import { formatProjectDisplayName } from "@/lib/project-display";
import { projectQualifiesForSaneamentoModule } from "@/lib/saneamento/discipline";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

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

function schemaLikelyMissing(err: unknown): boolean {
  const s = getSupabaseErrorMessage(err).toLowerCase();
  return (
    s.includes("workspace_spaces") ||
    s.includes("workspace_space_nodes") ||
    s.includes("does not exist") ||
    s.includes("não existe") ||
    (s.includes("relation") && s.includes("exist"))
  );
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

  const podeGerirEspacos = canManageWorkspaceSpaces(myRole);
  const podeEditarNos = canEditWorkspaceNodes(myRole);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setSchemaBanner(null);
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
          "As tabelas de Espaços ainda não existem no banco. Execute o arquivo lib/sql/workspaces-spaces.sql no Supabase (SQL Editor)."
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
      setLoading(false);
      return;
    }

    const nodeRes = await supabase
      .from("workspace_space_nodes")
      .select(
        "id, space_id, parent_id, kind, name, color, sort_order, project_id, projects(id, name, municipality, state, discipline, sanitation_type)"
      )
      .in("space_id", sidList)
      .order("sort_order")
      .order("name");

    if (nodeRes.error) {
      logSupabaseUnlessJwt("[spaces] nodes", nodeRes.error);
      showErrorToast("Não foi possível carregar pastas/listas", getSupabaseErrorMessage(nodeRes.error));
      setNodes([]);
    } else {
      const rows = (nodeRes.data || []) as Array<Omit<WorkspaceNode, "projects"> & { projects?: unknown }>;
      setNodes(
        rows.map((r) => ({
          ...r,
          projects: normalizeProjectEmbed(r.projects),
        }))
      );
    }

    if (projRes.error) {
      logSupabaseUnlessJwt("[spaces] projects", projRes.error);
      setProjects([]);
    } else {
      setProjects((projRes.data as ProjectPick[]) || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    getCurrentProfile().then((p) => setMyRole(p?.role ?? null));
  }, []);

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
    setExpandedFolders((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
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

    const { error } = await supabase.from("workspace_space_nodes").insert({
      space_id: selectedSpaceId,
      parent_id: parentId,
      kind,
      name: name.trim(),
      sort_order: nextOrder,
      color: null,
      project_id: null,
    });

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

  function renderNodeTree(parentId: string | null, depth: number) {
    if (!selectedSpaceId) return null;
    const list = siblingsOf(nodesInSpace, selectedSpaceId, parentId);
    return (
      <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        {list.map((node) => {
          const isFolder = node.kind === "folder";
          const open = expandedFolders[node.id] ?? true;
          const rowColor = node.color || (isFolder ? "var(--warning)" : "var(--primary)");
          return (
            <div key={node.id} style={{ marginBottom: 2 }}>
              <div
                className="flex items-center gap-1"
                style={{
                  borderRadius: 8,
                  background:
                    selectedNodeId === node.id
                      ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                      : "transparent",
                  border:
                    selectedNodeId === node.id ? "1px solid color-mix(in srgb, var(--primary) 35%, transparent)" : "1px solid transparent",
                }}
              >
                {isFolder ? (
                  <button
                    type="button"
                    onClick={() => toggleFolder(node.id)}
                    className="p-1 rounded"
                    style={{ color: "var(--muted-fg)" }}
                    aria-label={open ? "Recolher" : "Expandir"}
                  >
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : (
                  <span style={{ width: 22 }} />
                )}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left py-1.5 pr-2"
                  style={{ background: "none", border: "none", cursor: "pointer" }}
                >
                  {isFolder ? (
                    <Folder size={15} style={{ color: rowColor, flexShrink: 0 }} />
                  ) : (
                    <ListTodo size={15} style={{ color: rowColor, flexShrink: 0 }} />
                  )}
                  <span
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--foreground)" }}
                  >
                    {node.name}
                  </span>
                  {node.kind === "list" && node.project_id && (
                    <Badge variant="neutral" style={{ fontSize: 10, flexShrink: 0 }}>
                      Projeto
                    </Badge>
                  )}
                </button>
                {podeEditarNos && (
                  <div className="flex items-center gap-0.5 pr-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Mover para cima"
                      onClick={() => void moveNode(node, -1)}
                    >
                      <ArrowUp size={12} />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Mover para baixo"
                      onClick={() => void moveNode(node, 1)}
                    >
                      <ArrowDown size={12} />
                    </Button>
                  </div>
                )}
              </div>
              {isFolder && open && renderNodeTree(node.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
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
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cor">
                  <Select value={newSpaceColor} onChange={(e) => setNewSpaceColor(e.target.value)}>
                    {COLOR_PRESETS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Ícone">
                  <Select value={newSpaceIcon} onChange={(e) => setNewSpaceIcon(e.target.value)}>
                    {SPACE_ICON_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
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
                  ) : (
                    renderNodeTree(null, 0)
                  )}
                </div>
                <div className="lg:border-l lg:pl-4 flex-1 min-w-0" style={{ borderColor: "var(--border)" }}>
                  {!selectedNode ? (
                    <p className="text-sm text-muted">Clique em uma pasta ou lista para ver detalhes e personalizar.</p>
                  ) : (
                    <NodeInspector
                      node={selectedNode}
                      projects={projects}
                      podeEditar={podeEditarNos}
                      onPatch={(patch) => void updateNodePatch(selectedNode.id, patch)}
                      onDelete={() => void handleDeleteNode(selectedNode.id)}
                      onAddChild={(kind, parentId) => void addNode(kind, parentId)}
                      saneHref={saneHref}
                    />
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Cor">
          <Select value={color} onChange={(e) => setColor(e.target.value)}>
            {COLOR_PRESETS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ícone">
          <Select value={icon} onChange={(e) => setIcon(e.target.value)}>
            {SPACE_ICON_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
        </Field>
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
  podeEditar,
  onPatch,
  onDelete,
  onAddChild,
  saneHref,
}: {
  node: WorkspaceNode;
  projects: ProjectPick[];
  podeEditar: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onAddChild: (kind: "folder" | "list", parentId: string) => void;
  saneHref: string | null;
}) {
  const [name, setName] = useState(node.name);
  const [color, setColor] = useState(node.color || "");
  const [projectId, setProjectId] = useState(node.project_id || "");

  useEffect(() => {
    setName(node.name);
    setColor(node.color || "");
    setProjectId(node.project_id || "");
  }, [node.id, node.name, node.color, node.project_id]);

  const linked = node.projects;

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
