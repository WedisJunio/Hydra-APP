/**
 * Hierarquia de papéis — alinhar UI e `lib/sql/permissions*.sql`.
 *
 * - projetista / employee: só o vinculado a si; em projetos, basicamente criar tarefas.
 * - projetista_lider: cria/edita projetos e tarefas onde é líder; vê rendimento só de cargos ≤ ao dele.
 * - líder, coordenador, gerência (manager), admin: acesso total ao portfólio (dashboard, equipes, etc.).
 */

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  manager: "Gerência",
  coordinator: "Coordenador",
  leader: "Líder",
  projetista_lider: "Projetista líder",
  projetista: "Projetista",
  employee: "Projetista (legado)",
  member: "Membro",
};

/**
 * Papéis anteriores a projetista / projetista_lider — veem a aba Usuários no menu.
 * Os novos papéis de projetista usam fluxo restrito e não acessam o diretório.
 */
const LEGACY_APP_ROLES = new Set([
  "admin",
  "manager",
  "coordinator",
  "leader",
  "employee",
]);

export function isLegacyAppRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return LEGACY_APP_ROLES.has(role);
}

/** Opções ao alterar o campo `role` de um usuário (cadastro / perfil). */
export const USER_ROLE_ASSIGN_OPTIONS: readonly string[] = [
  "admin",
  "manager",
  "coordinator",
  "leader",
  "projetista_lider",
  "projetista",
  "employee",
] as const;

/**
 * Pode editar perfil de outrem e mudar papel — coordenação, gerência, líder ou admin.
 * Colaborador legado (`employee`) vê a aba Usuários, mas não altera cargo de terceiros.
 */
export function canAssignUserRoles(role: string | null | undefined): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "coordinator" ||
    role === "leader"
  );
}

/**
 * Quanto maior, mais responsabilidade (comparação "cargo acima / abaixo").
 */
export const ROLE_RANK: Record<string, number> = {
  employee: 15,
  projetista: 15,
  projetista_lider: 40,
  leader: 60,
  coordinator: 70,
  manager: 80,
  admin: 100,
};

export type RoleKey = keyof typeof ROLE_RANK;

export function roleRank(role: string | null | undefined): number {
  if (!role || !(role in ROLE_RANK)) return -1;
  return ROLE_RANK[role as RoleKey];
}

export function isAtLeastRole(
  role: string | null | undefined,
  minRole: RoleKey
): boolean {
  return roleRank(role) >= ROLE_RANK[minRole];
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Gerência: admin ou manager */
export function isManagerOrAbove(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Acesso total ao portfólio (dashboard completo, ver toda a equipe no ponto, etc.). */
export function hasFullPortfolioAccess(role: string | null | undefined): boolean {
  return (
    role === "admin" ||
    role === "manager" ||
    role === "coordinator" ||
    role === "leader"
  );
}

/** Projetista (ou colaborador legado `employee`): só fluxo estreito em projetos/dashboard. */
export function isNarrowProjetista(role: string | null | undefined): boolean {
  return role === "projetista" || role === "employee";
}

export function isProjetistaLider(role: string | null | undefined): boolean {
  return role === "projetista_lider";
}

export function isCoordinatorOrAbove(role: string | null | undefined): boolean {
  return isAtLeastRole(role, "coordinator");
}
