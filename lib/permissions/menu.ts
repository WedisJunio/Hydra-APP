import type { LucideIcon } from "lucide-react";

import { isAtLeastRole, type RoleKey } from "./roles";

/** Item do menu lateral — `minRole` opcional esconde o link para quem está abaixo. */
export type SidebarMenuItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Se definido, só usuários com este posto ou acima veem o item. */
  minRole?: RoleKey;
  /** Se definido, tem preced sobre `minRole` (ex.: item só para papéis legados). */
  showMenu?: (role: string | null | undefined) => boolean;
};

export function filterSidebarMenuByRole(
  items: SidebarMenuItem[],
  role: string | null | undefined
): SidebarMenuItem[] {
  return items.filter((item) => {
    if (item.showMenu) return item.showMenu(role);
    if (!item.minRole) return true;
    return isAtLeastRole(role, item.minRole);
  });
}
