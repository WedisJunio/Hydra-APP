import { hasFullPortfolioAccess } from "./roles";

/**
 * Quem pode alterar a árvore de Espaços (pastas/listas) — alinhar a workspaces-spaces.sql.
 */
export function canEditWorkspaceNodes(role: string | null | undefined): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "coordinator" ||
    role === "leader" ||
    role === "projetista_lider"
  );
}

/** Criar, renomear ou excluir um espaço de topo — alinhado a has_full_portfolio_access() no SQL. */
export function canManageWorkspaceSpaces(role: string | null | undefined): boolean {
  return hasFullPortfolioAccess(role);
}
