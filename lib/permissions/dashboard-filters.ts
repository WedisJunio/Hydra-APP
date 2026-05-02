import {
  hasFullPortfolioAccess,
  isNarrowProjetista,
  isProjetistaLider,
  roleRank,
} from "./roles";

export type DashboardTaskRow = {
  id: string;
  assigned_to: string | null;
  created_by?: string | null;
  project_id: string;
  [key: string]: unknown;
};

export type DashboardUserRow = {
  id: string;
  name: string;
  role?: string | null;
};

/** Tarefas exibidas nos gráficos (projetista: só as vinculadas a ele). */
export function filterTasksForDashboard(
  tasks: DashboardTaskRow[],
  profileId: string,
  role: string | null | undefined
): DashboardTaskRow[] {
  if (hasFullPortfolioAccess(role) || isProjetistaLider(role)) {
    return tasks;
  }
  if (isNarrowProjetista(role)) {
    return tasks.filter(
      (t) =>
        t.assigned_to === profileId ||
        t.created_by === profileId
    );
  }
  return tasks;
}

/**
 * Colaboradores nos gráficos "por pessoa".
 * Projetista líder: só quem tem cargo ≤ ao dele (não vê líder, coordenador, gerência, admin).
 */
export function filterUsersForDashboard(
  users: DashboardUserRow[],
  profileId: string,
  role: string | null | undefined
): DashboardUserRow[] {
  if (hasFullPortfolioAccess(role)) {
    return users;
  }
  if (isProjetistaLider(role)) {
    const cap = roleRank("projetista_lider");
    return users.filter((u) => {
      if (u.id === profileId) return true;
      const r = roleRank(u.role);
      if (r < 0) return true;
      return r <= cap;
    });
  }
  if (isNarrowProjetista(role)) {
    return users.filter((u) => u.id === profileId);
  }
  return users;
}
