import {
  hasFullPortfolioAccess,
  isManagerOrAbove,
  isNarrowProjetista,
  isProjetistaLider,
} from "./roles";

/** Cadastro de novos usuários — RLS: insert só gerência (manager) + admin. */
export function canCreateAppUsers(role: string | null | undefined): boolean {
  return isManagerOrAbove(role);
}

/** Salas de reunião — cadastro: gerência+ */
export function canManageMeetingRooms(role: string | null | undefined): boolean {
  return isManagerOrAbove(role);
}

export function canCreateChatGroup(role: string | null | undefined): boolean {
  return hasFullPortfolioAccess(role) || isProjetistaLider(role);
}

/** Abas Equipe / Espelho em Ponto — líder, coordenador, gerência (e admin). */
export function canAccessPontoTeamViews(role: string | null | undefined): boolean {
  return hasFullPortfolioAccess(role);
}

export function canCreateProject(role: string | null | undefined): boolean {
  return hasFullPortfolioAccess(role) || isProjetistaLider(role);
}

/** Na UI de Projetos: editar metadados, PDF, membros, excluir projeto. Projetista só trabalha com tarefas. */
export function canEditProjectShell(role: string | null | undefined): boolean {
  return !isNarrowProjetista(role);
}

/** Contratos / licitações: mutações no banco exigem RLS has_full_portfolio_access. */
export function canMutateContratosModule(role: string | null | undefined): boolean {
  return hasFullPortfolioAccess(role);
}
