"use client";

import { useCallback, useState } from "react";
import {
  Folder,
  ListTodo,
  ChevronRight,
  ChevronDown,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import type { WorkspaceTreeNode, TreePlacement } from "@/lib/workspaces/spaces-shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  nodes: WorkspaceTreeNode[];
  spaceId: string;
  selectedNodeId: string | null;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  onSelectNode: (id: string) => void;
  podeEditar: boolean;
  onMoveUpDown: (node: WorkspaceTreeNode, dir: -1 | 1) => void;
  onDropReorder: (draggedId: string, targetId: string, placement: TreePlacement) => void;
};

function placementFromPointer(
  el: HTMLElement,
  clientY: number,
  kind: "folder" | "list"
): TreePlacement {
  const r = el.getBoundingClientRect();
  const pct = (clientY - r.top) / Math.max(r.height, 1);
  if (kind === "folder") {
    if (pct < 0.32) return "before";
    return "inside";
  }
  return pct < 0.5 ? "before" : "after";
}

export function WorkspaceTreeDnD({
  nodes,
  spaceId,
  selectedNodeId,
  expandedFolders,
  onToggleFolder,
  onSelectNode,
  podeEditar,
  onMoveUpDown,
  onDropReorder,
}: Props) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPlacement, setDragOverPlacement] = useState<TreePlacement | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (e: React.DragEvent, nodeId: string) => {
      if (!podeEditar) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("application/x-workspace-node", nodeId);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(nodeId);
    },
    [podeEditar]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
    setDragOverPlacement(null);
  }, []);

  const renderDropHint = (nodeId: string) => {
    if (dragOverId !== nodeId || !dragOverPlacement || !draggingId) return null;
    const labels: Record<TreePlacement, string> = {
      before: "↑ acima",
      after: "↓ abaixo",
      inside: "→ dentro da pasta",
    };
    return (
      <div
        className="text-[10px] font-bold uppercase mt-0.5 px-1 rounded"
        style={{
          color: "var(--primary)",
          background: "color-mix(in srgb, var(--primary) 12%, transparent)",
        }}
      >
        {labels[dragOverPlacement]}
      </div>
    );
  };

  function renderBranch(parentId: string | null, depth: number) {
    const list = nodes
      .filter((n) => n.space_id === spaceId && n.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));

    return (
      <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        {list.map((node) => {
          const isFolder = node.kind === "folder";
          const open = expandedFolders[node.id] ?? true;
          const rowColor = node.color || (isFolder ? "var(--warning)" : "var(--primary)");

          return (
            <div key={node.id} style={{ marginBottom: 2 }}>
              <div
                data-tree-row
                className="flex items-start gap-0"
                draggable={podeEditar}
                onDragStart={(e) => handleDragStart(e, node.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => {
                  if (!podeEditar || draggingId === node.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const tgt = e.currentTarget.querySelector("[data-drop-zone]") as HTMLElement;
                  if (!tgt) return;
                  const p = placementFromPointer(tgt, e.clientY, node.kind);
                  setDragOverId(node.id);
                  setDragOverPlacement(p);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverId(null);
                    setDragOverPlacement(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const from = e.dataTransfer.getData("application/x-workspace-node");
                  const tgt = e.currentTarget.querySelector("[data-drop-zone]") as HTMLElement;
                  if (!from || from === node.id || !tgt) {
                    handleDragEnd();
                    return;
                  }
                  const p = placementFromPointer(tgt, e.clientY, node.kind);
                  onDropReorder(from, node.id, p);
                  handleDragEnd();
                }}
                style={{
                  borderRadius: 8,
                  background:
                    selectedNodeId === node.id
                      ? "color-mix(in srgb, var(--primary) 12%, var(--surface))"
                      : dragOverId === node.id
                        ? "color-mix(in srgb, var(--info) 10%, var(--surface))"
                        : "transparent",
                  border:
                    selectedNodeId === node.id
                      ? "1px solid color-mix(in srgb, var(--primary) 35%, transparent)"
                      : dragOverId === node.id
                        ? "1px dashed color-mix(in srgb, var(--info) 50%, transparent)"
                        : "1px solid transparent",
                }}
              >
                {podeEditar && (
                  <span
                    className="cursor-grab py-2 px-0.5 shrink-0"
                    style={{ color: "var(--muted-fg)", touchAction: "none" }}
                    title="Arrastar para reorganizar"
                  >
                    <GripVertical size={14} />
                  </span>
                )}
                <div className="flex-1 min-w-0" data-drop-zone>
                  <div className="flex items-center gap-1">
                    {isFolder ? (
                      <button
                        type="button"
                        onClick={() => onToggleFolder(node.id)}
                        className="p-1 rounded shrink-0"
                        style={{ color: "var(--muted-fg)" }}
                        aria-label={open ? "Recolher" : "Expandir"}
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    ) : (
                      <span className="inline-block" style={{ width: 22 }} />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectNode(node.id)}
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
                    {podeEditar && (
                      <div className="flex items-center gap-0.5 pr-1 shrink-0">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Mover para cima"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveUpDown(node, -1);
                          }}
                        >
                          <ArrowUp size={12} />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Mover para baixo"
                          onClick={(e) => {
                            e.stopPropagation();
                            onMoveUpDown(node, 1);
                          }}
                        >
                          <ArrowDown size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                  {renderDropHint(node.id)}
                </div>
              </div>
              {isFolder && open && renderBranch(node.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {podeEditar && draggingId && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = e.dataTransfer.getData("application/x-workspace-node");
            if (!from) return;
            onDropReorder(from, "__root__", "inside");
            handleDragEnd();
          }}
          className="mb-2 p-2 rounded-lg text-center text-xs font-semibold"
          style={{
            border: "2px dashed var(--border)",
            color: "var(--muted-fg)",
            background: "var(--surface-2)",
          }}
        >
          Soltar aqui para mover para a raiz do espaço
        </div>
      )}
      {renderBranch(null, 0)}
    </div>
  );
}
