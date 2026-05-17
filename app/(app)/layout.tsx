"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  MessageSquare,
  Calendar as CalendarIcon,
  Clock,
  ChevronRight,
  Moon,
  Sun,
  Droplets,
  FileText,
  Layers,
} from "lucide-react";

import AuthGuard from "@/components/auth-guard";
import { SessionKeepAlive } from "@/components/session-keep-alive";
import LogoutButton from "@/components/logout-button";
import { Avatar } from "@/components/ui/avatar";
import {
  ROLE_LABELS,
  filterSidebarMenuByRole,
  isLegacyAppRole,
  type SidebarMenuItem,
} from "@/lib/permissions";
import { supabase } from "@/lib/supabase/client";
import { COMPANY_LOGO_SRC } from "@/lib/company-logo";

const menuItems: SidebarMenuItem[] = [
  // Opcional: defina `minRole` para esconder itens (ex.: { ..., minRole: "leader" }).
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projetos", href: "/projects", icon: FolderKanban },
  { label: "Contratos", href: "/contratos", icon: FileText },
  { label: "Espaços", href: "/spaces", icon: Layers },
  { label: "Tarefas", href: "/tasks", icon: CheckSquare },
  { label: "Ponto", href: "/ponto", icon: Clock },
  {
    label: "Usuários",
    href: "/users",
    icon: Users,
    showMenu: (r) => isLegacyAppRole(r),
  },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Calendário", href: "/calendar", icon: CalendarIcon },
];

type CurrentUserProfile = {
  id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [authEmail, setAuthEmail] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark" | "hydra">("light");

  useEffect(() => {
    let active = true;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active || !user) return;
      setAuthEmail(user.email || "");

      const { data } = await supabase
        .from("users")
        .select("id, name, full_name, email, role")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (active) setCurrentUser(data ?? null);
    }

    loadCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("hydra-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme: "light" | "dark" | "hydra" =
      saved === "dark" || saved === "hydra" || saved === "light"
        ? saved
        : prefersDark
        ? "dark"
        : "light";

    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
  }, []);

  function handleToggleTheme() {
    // Ciclo: light → dark → hydra → light
    const nextTheme: "light" | "dark" | "hydra" =
      theme === "light" ? "dark" : theme === "dark" ? "hydra" : "light";
    setTheme(nextTheme);
    window.localStorage.setItem("hydra-theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    document.documentElement.style.colorScheme = nextTheme === "light" ? "light" : "dark";
  }

  const themeMeta: Record<typeof theme, { next: string; icon: React.ReactNode; title: string }> = {
    light: {
      next: "dark",
      icon: <Sun size={16} />,
      title: "Tema atual: Claro · Clique para Escuro",
    },
    dark: {
      next: "hydra",
      icon: <Moon size={16} />,
      title: "Tema atual: Escuro · Clique para HydraCode",
    },
    hydra: {
      next: "light",
      icon: <Droplets size={16} />,
      title: "Tema atual: HydraCode · Clique para Claro",
    },
  };

  const visibleMenuItems = useMemo(
    () => filterSidebarMenuByRole(menuItems, currentUser?.role),
    [currentUser?.role]
  );

  const currentItem = useMemo(
    () => menuItems.find((item) => pathname?.startsWith(item.href)),
    [pathname]
  );

  // Fallback inteligente: se o usuário não preencheu o nome, NÃO mostra o e-mail
  // cru (que pode virar algo como "wedis123"). Em vez disso, pega o prefixo do
  // e-mail, remove números e caracteres não-letras, capitaliza cada palavra.
  function prettifyEmailHandle(email: string): string {
    if (!email) return "Usuário";
    const handle = email.split("@")[0] || email;
    const cleaned = handle.replace(/[._\-]/g, " ").replace(/\d+/g, "").trim();
    if (!cleaned) return "Usuário";
    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  // Prioridade: full_name (atualizado via modal de perfil) → name (legado) → email tratado
  const displayName =
    currentUser?.full_name?.trim() ||
    currentUser?.name?.trim() ||
    prettifyEmailHandle(authEmail);
  const displayRole =
    (currentUser?.role && ROLE_LABELS[currentUser.role]) ||
    currentUser?.role ||
    "Membro da equipe";

  return (
    <AuthGuard>
      <SessionKeepAlive />
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={COMPANY_LOGO_SRC}
                alt="Logo da empresa"
                className="sidebar-brand-logo"
              />
            </div>
            <div className="sidebar-brand-meta">
              <span className="sidebar-brand-tag">PLATAFORMA</span>
              <div className="sidebar-brand-name">Gestão de projetos</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-section">Menu</div>
            {visibleMenuItems.map((item) => {
              const isActive = pathname?.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="sidebar-link"
                  data-active={isActive ? "true" : "false"}
                  title={item.label}
                >
                  <span className="sidebar-link-icon">
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            {currentUser?.id ? (
              <Link
                href={`/users/${currentUser.id}`}
                className="sidebar-user sidebar-user-link"
                title={`Abrir perfil de ${displayName}`}
              >
                <Avatar name={displayName} size="md" />
                <div className="sidebar-user-meta min-w-0 flex-1">
                  <div className="sidebar-user-name">{displayName}</div>
                  <div className="sidebar-user-role">{displayRole}</div>
                </div>
                <ChevronRight
                  size={14}
                  strokeWidth={2}
                  className="sidebar-user-chevron"
                />
              </Link>
            ) : (
              <div className="sidebar-user">
                <Avatar name={displayName} size="md" />
                <div className="sidebar-user-meta min-w-0 flex-1">
                  <div className="sidebar-user-name">{displayName}</div>
                  <div className="sidebar-user-role">{displayRole}</div>
                </div>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <LogoutButton />
            </div>
          </div>
        </aside>

        <div className="app-content">
          <header className="topbar">
            <div className="crumbs">
              <span>Início</span>
              <ChevronRight size={14} strokeWidth={2} />
              <span className="crumbs-current">
                {currentItem?.label ?? "Painel"}
              </span>
            </div>

            <div
              className="flex items-center gap-3"
              style={{ fontSize: "var(--text-sm)" }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={handleToggleTheme}
                title={themeMeta[theme].title}
                aria-label={themeMeta[theme].title}
              >
                {themeMeta[theme].icon}
              </button>
              <div
                className="hidden"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                }}
              >
                <span className="font-semibold">{displayName}</span>
                <span className="text-muted text-xs">{displayRole}</span>
              </div>
              <Avatar name={displayName} size="sm" primary />
            </div>
          </header>

          <main className="app-main">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
